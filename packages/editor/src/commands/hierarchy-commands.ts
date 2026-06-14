import type { EntityId } from '@haku/core'
import { commitSceneEdit } from './scene-history.js'
import {
  canDropEntity,
  type HierarchyDropMode,
} from '../hierarchy/hierarchy-drag.js'
import { useEditorStore } from '../store/editor-store.js'

export function moveEntityInHierarchyByDrop(
  dragged: EntityId,
  target: EntityId,
  mode: HierarchyDropMode,
): void {
  const { world } = useEditorStore.getState()
  if (!world) return
  if (!canDropEntity(world, dragged, target, mode)) return

  commitSceneEdit((draft) => {
    draft.world.moveEntityInHierarchy(dragged, target, mode)
  })
}
