import type { EntityId } from '@haku/core'
import {
  PrefabInstanceComponent,
  TransformComponent,
  getCoreComponent,
} from '@haku/core'
import type { SceneDocument } from '@haku/schema'
import type { Command } from './command-bus.js'
import { globalCommandBus } from './command-bus.js'
import { useEditorStore } from '../store/editor-store.js'
import { extractPrefabSubtree } from '../services/project-service.js'

export class SetTransformCommand implements Command {
  constructor(
    private readonly entityId: EntityId,
    private readonly before: ReturnType<typeof TransformComponent.schema.parse>,
    private readonly after: ReturnType<typeof TransformComponent.schema.parse>,
  ) {}

  execute(): void {
    const world = useEditorStore.getState().world
    if (!world) return
    world.addComponent(this.entityId, TransformComponent, this.after)
    useEditorStore.getState().setWorld(world)
  }

  undo(): void {
    const world = useEditorStore.getState().world
    if (!world) return
    world.addComponent(this.entityId, TransformComponent, this.before)
    useEditorStore.getState().setWorld(world)
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
    const world = useEditorStore.getState().world
    if (!world) return
    const id = world.createEntity(this.name)
    world.addComponent(id, TransformComponent, TransformComponent.defaults!())
    this.createdId = id
    useEditorStore.getState().setWorld(world)
    useEditorStore.getState().setSelection(id)
  }

  undo(): void {
    const world = useEditorStore.getState().world
    if (!world || !this.createdId) return
    world.destroyEntity(this.createdId)
    useEditorStore.getState().setWorld(world)
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
    world.destroyEntity(this.entityId)
    useEditorStore.getState().setWorld(world)
    useEditorStore.getState().setSelection(null)
  }

  undo(): void {
    const world = useEditorStore.getState().world
    if (!world || !this.snapshot) return
    world.createEntity(this.snapshot.name, this.snapshot.id)
    for (const comp of this.snapshot.components) {
      const type = getCoreComponent(comp.typeId)
      if (type && comp.data !== undefined) {
        world.addComponent(this.snapshot.id, type, comp.data)
      }
    }
    world.setParent(this.snapshot.id, this.snapshot.parent)
    useEditorStore.getState().setWorld(world)
    useEditorStore.getState().setSelection(this.snapshot.id)
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
    const { world, sceneDocument, scenePath } = useEditorStore.getState()
    if (!world || !sceneDocument || !scenePath) return

    this.beforeDoc = structuredClone(sceneDocument)
    this.childSnapshots = []

    const prefab = extractPrefabSubtree(world, this.rootId, this.prefabId)

    for (const child of [...world.getChildren(this.rootId)]) {
      this.childSnapshots.push(snapshotEntity(world, child))
      world.destroyEntity(child)
    }

    for (const typeId of [...world.getComponentTypes(this.rootId)]) {
      if (typeId === 'Transform') continue
      const type = getCoreComponent(typeId)
      if (type) world.removeComponent(this.rootId, type)
    }

    world.addComponent(this.rootId, PrefabInstanceComponent, { prefabId: this.prefabId })

    const nextDoc: SceneDocument = {
      ...sceneDocument,
      prefabs: { ...sceneDocument.prefabs, [this.prefabId]: prefab },
    }

    useEditorStore.getState().setScene(scenePath, nextDoc, world)
  }

  undo(): void {
    const { world, scenePath } = useEditorStore.getState()
    if (!world || !this.beforeDoc || !scenePath) return

    const pi = getCoreComponent('PrefabInstance')
    if (pi) world.removeComponent(this.rootId, pi)

    for (const snap of this.childSnapshots) {
      restoreSnapshot(world, snap)
      world.setParent(snap.id, this.rootId)
    }

    useEditorStore.getState().setScene(scenePath, this.beforeDoc, world)
  }
}

export class PlacePrefabCommand implements Command {
  private createdId: EntityId | null = null

  constructor(
    private readonly prefabId: string,
    private readonly position: [number, number, number] = [0, 0, 0],
  ) {}

  execute(): void {
    const { world, sceneDocument } = useEditorStore.getState()
    if (!world || !sceneDocument) return
    if (!sceneDocument.prefabs[this.prefabId]) throw new Error(`Prefab not found: ${this.prefabId}`)

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
    this.createdId = id
    useEditorStore.getState().setWorld(world)
    useEditorStore.getState().setSelection(id)
  }

  undo(): void {
    const world = useEditorStore.getState().world
    if (!world || !this.createdId) return
    world.destroyEntity(this.createdId)
    useEditorStore.getState().setWorld(world)
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
