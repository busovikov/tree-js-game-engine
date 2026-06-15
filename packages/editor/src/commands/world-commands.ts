import type { EntityId } from '@haku/core'
import {
  MeshRendererComponent,
  PrefabInstanceComponent,
  TransformComponent,
  getCoreComponent,
} from '@haku/core'
import type { MeshGeometryType } from '@haku/schema'
import { MESH_GEOMETRY_TYPE_LABELS, defaultGeometryParams } from '@haku/schema'
import type { Command } from './command-bus.js'
import { globalCommandBus } from './command-bus.js'
import { commitSceneEdit } from './scene-history.js'
import { useEditorStore } from '../store/editor-store.js'
import { extractPrefabSubtree } from '../services/project-service.js'
import { primarySelection } from '../selection/selection-utils.js'
import {
  type EntityPlacement,
  createEntityWithPlacement,
  duplicateEntitySubtree,
  uniqueEntityName,
} from './entity-placement.js'

export const MESH_PRIMITIVE_LABELS = MESH_GEOMETRY_TYPE_LABELS

export function createEmptyEntity(placement: EntityPlacement = 'root'): void {
  const selected = primarySelection(useEditorStore.getState().selection)
  const baseName =
    placement === 'child' ? 'New Child' : placement === 'parent' ? 'New Parent' : 'New Entity'

  commitSceneEdit((draft) => {
    const name = uniqueEntityName(draft.world, baseName)
    return [createEntityWithPlacement(draft.world, name, placement, selected)]
  })
}

export function createMeshPrimitive(geometryType: MeshGeometryType, placement: EntityPlacement = 'root'): void {
  const selected = primarySelection(useEditorStore.getState().selection)
  const label = MESH_PRIMITIVE_LABELS[geometryType]

  commitSceneEdit((draft) => {
    const name = uniqueEntityName(draft.world, label)
    const id = createEntityWithPlacement(draft.world, name, placement, selected)
    const meshDefaults = MeshRendererComponent.defaults!()
    draft.world.addComponent(id, MeshRendererComponent, {
      ...meshDefaults,
      geometryType,
      geometryParams: defaultGeometryParams(geometryType),
    })
    return [id]
  })
}

/** @deprecated Use createEmptyEntity('child') instead. */
export function createEntity(name: string): void {
  const selected = primarySelection(useEditorStore.getState().selection)

  commitSceneEdit((draft) => {
    const id = draft.world.createEntity(name)
    const defaults = TransformComponent.defaults!()

    if (selected && draft.world.hasEntity(selected)) {
      draft.world.addComponent(id, TransformComponent, defaults)
      draft.world.setParent(id, selected)
    } else {
      const roots = draft.world.getRootEntities()
      const index = Math.max(0, roots.length - 1)
      draft.world.addComponent(id, TransformComponent, {
        ...defaults,
        position: [index * 1.5, 0, 0],
      })
    }

    return [id]
  })
}

export function deleteSelectedEntities(): void {
  const { selection, world } = useEditorStore.getState()
  if (selection.length === 0 || !world) return

  commitSceneEdit((draft) => {
    for (const id of selection) {
      if (draft.world.hasEntity(id)) {
        draft.world.destroyEntity(id)
      }
    }
    return []
  })
}

function selectionDuplicateRoots(
  world: import('@haku/core').World,
  selection: readonly EntityId[],
): EntityId[] {
  const selected = new Set(selection.map((id) => id.value))
  return selection.filter((id) => {
    const parent = world.getParent(id)
    return !parent || !selected.has(parent.value)
  })
}

export function duplicateSelectedEntity(): void {
  const { selection, world } = useEditorStore.getState()
  if (selection.length === 0 || !world) return

  const roots = selectionDuplicateRoots(world, selection)
  if (roots.length === 0) return

  commitSceneEdit((draft) => {
    const duplicated: EntityId[] = []
    for (const root of roots) {
      if (!draft.world.hasEntity(root)) continue
      duplicated.push(duplicateEntitySubtree(draft.world, root))
    }
    return duplicated.length > 0 ? duplicated : null
  })
}

export function createPrefab(rootId: EntityId, prefabId: string): void {
  const { world, sceneDocument } = useEditorStore.getState()
  if (!world || !sceneDocument) return

  const prefab = extractPrefabSubtree(world, rootId, prefabId)
  const childIds = world.getChildren(rootId)

  commitSceneEdit((draft) => {
    if (!draft.sceneDocument) return [rootId]

    for (const childId of childIds) {
      draft.world.destroyEntity(childId)
    }

    for (const typeId of [...draft.world.getComponentTypes(rootId)]) {
      if (typeId === 'Transform') continue
      const type = getCoreComponent(typeId)
      if (type) draft.world.removeComponent(rootId, type)
    }

    draft.world.addComponent(rootId, PrefabInstanceComponent, { prefabId })
    draft.sceneDocument = {
      ...draft.sceneDocument,
      prefabs: { ...draft.sceneDocument.prefabs, [prefabId]: prefab },
    }

    return [rootId]
  })
}

export function placePrefab(prefabId: string, position: [number, number, number] = [0, 0, 0]): void {
  const { sceneDocument } = useEditorStore.getState()
  if (!sceneDocument?.prefabs[prefabId]) throw new Error(`Prefab not found: ${prefabId}`)

  commitSceneEdit((draft) => {
    const id = draft.world.createEntity(prefabId)
    draft.world.addComponent(id, TransformComponent, {
      position,
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    draft.world.addComponent(id, PrefabInstanceComponent, {
      prefabId,
      overrides: { Transform: { position } },
    })
    return [id]
  })
}

export function executeCommand(command: Command): void {
  globalCommandBus.execute(command)
}

export { globalCommandBus }
