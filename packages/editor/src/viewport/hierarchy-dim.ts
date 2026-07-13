import type { EntityId, IWorld } from '@haku/core'
import type * as THREE from 'three'
import { setObjectEditorDimmed } from './object-visual-dim.js'

interface DimSyncAccess {
  getObject3D(id: EntityId): THREE.Object3D | undefined
}

/**
 * Dim every entity that is not in the hierarchy-filter highlight set. Passing
 * `null` (no active filter) restores every object to full brightness.
 */
export function applyHierarchyDim(
  world: IWorld,
  sync: DimSyncAccess,
  highlightIds: ReadonlySet<string> | null,
): void {
  const filterActive = highlightIds !== null
  for (const id of world.getAllEntities()) {
    const object3d = sync.getObject3D(id)
    if (!object3d) continue
    const highlighted = !filterActive || highlightIds.has(id.value)
    setObjectEditorDimmed(object3d, !highlighted)
  }
}
