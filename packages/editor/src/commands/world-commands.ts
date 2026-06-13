import type { EntityId } from '@haku/core'
import {
  PrefabInstanceComponent,
  TransformComponent,
  getCoreComponent,
} from '@haku/core'
import type { SceneDocument } from '@haku/schema'
import type { Command } from './command-bus.js'
import { globalCommandBus } from './command-bus.js'
import { mutateWorld } from './world-mutations.js'
import { useEditorStore } from '../store/editor-store.js'
import { extractPrefabSubtree } from '../services/project-service.js'

export class SetTransformCommand implements Command {
  constructor(
    private readonly entityId: EntityId,
    private readonly before: ReturnType<typeof TransformComponent.schema.parse>,
    private readonly after: ReturnType<typeof TransformComponent.schema.parse>,
  ) {}

  execute(): void {
    mutateWorld((world) => {
      world.addComponent(this.entityId, TransformComponent, this.after)
    })
  }

  undo(): void {
    mutateWorld((world) => {
      world.addComponent(this.entityId, TransformComponent, this.before)
    })
  }

  merge(other: Command): Command | null {
    if (!(other instanceof SetTransformCommand)) return null
    if (other.entityId.value !== this.entityId.value) return null
    return new SetTransformCommand(this.entityId, this.before, other.after)
  }
}

export class CreateEntityCommand implements Command {
  private createdId: EntityId | null = null

  constructor(private readonly name: string) {}

  execute(): void {
    const selection = useEditorStore.getState().selection
    let createdId: EntityId | null = null

    mutateWorld((world) => {
      const id = world.createEntity(this.name)
      const defaults = TransformComponent.defaults!()

      if (selection && world.hasEntity(selection)) {
        world.addComponent(id, TransformComponent, defaults)
        world.setParent(id, selection)
      } else {
        const roots = world.getAllEntities().filter((e) => world.getParent(e) === null)
        const index = Math.max(0, roots.length - 1)
        world.addComponent(id, TransformComponent, {
          ...defaults,
          position: [index * 1.5, 0, 0],
        })
      }

      createdId = id
    })

    this.createdId = createdId
    if (createdId) useEditorStore.getState().setSelection(createdId)
  }

  undo(): void {
    if (!this.createdId) return
    const removedId = this.createdId
    mutateWorld((world) => {
      world.destroyEntity(removedId)
    })
    useEditorStore.getState().setSelection(null)
  }
}

export class DeleteEntityCommand implements Command {
  private snapshot: {
    id: EntityId
    name: string
    parent: EntityId | null
    components: Array<{ typeId: string; data: unknown }>
  } | null = null

  constructor(private readonly entityId: EntityId) {}

  execute(): void {
    const world = useEditorStore.getState().world
    if (!world) return

    this.snapshot = {
      id: this.entityId,
      name: world.getEntityName(this.entityId) ?? 'Entity',
      parent: world.getParent(this.entityId),
      components: world.getComponentTypes(this.entityId).map((typeId) => {
        const type = getCoreComponent(typeId)
        return { typeId, data: type ? world.getComponent(this.entityId, type) : undefined }
      }),
    }

    mutateWorld((world) => {
      world.destroyEntity(this.entityId)
    })
    useEditorStore.getState().setSelection(null)
  }

  undo(): void {
    if (!this.snapshot) return
    const snapshot = this.snapshot

    mutateWorld((world) => {
      world.createEntity(snapshot.name, snapshot.id)
      for (const comp of snapshot.components) {
        const type = getCoreComponent(comp.typeId)
        if (type && comp.data !== undefined) {
          world.addComponent(snapshot.id, type, comp.data)
        }
      }
      world.setParent(snapshot.id, snapshot.parent)
    })
    useEditorStore.getState().setSelection(snapshot.id)
  }
}

export class CreatePrefabCommand implements Command {
  private beforeDoc: SceneDocument | null = null
  private childSnapshots: Array<{ id: EntityId; name: string; components: Array<{ typeId: string; data: unknown }> }> = []

  constructor(
    private readonly rootId: EntityId,
    private readonly prefabId: string,
  ) {}

  execute(): void {
    const { world, sceneDocument } = useEditorStore.getState()
    if (!world || !sceneDocument) return

    this.beforeDoc = structuredClone(sceneDocument)
    this.childSnapshots = world.getChildren(this.rootId).map((child) => snapshotEntity(world, child))
    const prefab = extractPrefabSubtree(world, this.rootId, this.prefabId)

    mutateWorld((nextWorld) => {
      for (const snap of this.childSnapshots) {
        nextWorld.destroyEntity(snap.id)
      }

      for (const typeId of [...nextWorld.getComponentTypes(this.rootId)]) {
        if (typeId === 'Transform') continue
        const type = getCoreComponent(typeId)
        if (type) nextWorld.removeComponent(this.rootId, type)
      }

      nextWorld.addComponent(this.rootId, PrefabInstanceComponent, { prefabId: this.prefabId })
    })

    useEditorStore.getState().setSceneDocument({
      ...sceneDocument,
      prefabs: { ...sceneDocument.prefabs, [this.prefabId]: prefab },
    })
    useEditorStore.getState().setSelection(this.rootId)
  }

  undo(): void {
    if (!this.beforeDoc) return

    mutateWorld((world) => {
      const pi = getCoreComponent('PrefabInstance')
      if (pi) world.removeComponent(this.rootId, pi)

      for (const snap of this.childSnapshots) {
        restoreSnapshot(world, snap)
        world.setParent(snap.id, this.rootId)
      }
    })

    useEditorStore.getState().setSceneDocument(this.beforeDoc)
    useEditorStore.getState().setSelection(this.rootId)
  }
}

export class PlacePrefabCommand implements Command {
  private createdId: EntityId | null = null

  constructor(
    private readonly prefabId: string,
    private readonly position: [number, number, number] = [0, 0, 0],
  ) {}

  execute(): void {
    const { sceneDocument } = useEditorStore.getState()
    if (!sceneDocument?.prefabs[this.prefabId]) throw new Error(`Prefab not found: ${this.prefabId}`)

    let createdId: EntityId | null = null

    mutateWorld((world) => {
      const id = world.createEntity(this.prefabId)
      world.addComponent(id, TransformComponent, {
        position: this.position,
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      })
      world.addComponent(id, PrefabInstanceComponent, {
        prefabId: this.prefabId,
        overrides: { Transform: { position: this.position } },
      })
      createdId = id
    })

    this.createdId = createdId
    if (createdId) useEditorStore.getState().setSelection(createdId)
  }

  undo(): void {
    if (!this.createdId) return
    const removedId = this.createdId

    mutateWorld((world) => {
      world.destroyEntity(removedId)
    })
    useEditorStore.getState().setSelection(null)
  }
}

function snapshotEntity(world: import('@haku/core').World, id: EntityId) {
  return {
    id,
    name: world.getEntityName(id) ?? 'Entity',
    components: world.getComponentTypes(id).map((typeId) => {
      const type = getCoreComponent(typeId)
      return { typeId, data: type ? world.getComponent(id, type) : undefined }
    }),
  }
}

function restoreSnapshot(
  world: import('@haku/core').World,
  snap: ReturnType<typeof snapshotEntity>,
): void {
  world.createEntity(snap.name, snap.id)
  for (const comp of snap.components) {
    const type = getCoreComponent(comp.typeId)
    if (type && comp.data !== undefined) world.addComponent(snap.id, type, comp.data)
  }
}

export function executeCommand(command: Command): void {
  globalCommandBus.execute(command)
}

export { globalCommandBus }
