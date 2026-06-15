import { entityId, type EntityId } from '@haku/core'
import type { ThreeRenderBackend } from '@haku/engine'
import * as THREE from 'three'

interface OutlineSyncAccess {
  getObject3D(id: EntityId): THREE.Object3D | undefined
}

export interface SceneSelectionOutlineOptions {
  visible: boolean
  selectedIds: ReadonlySet<string>
}

export class SceneSelectionOutline {
  sync(
    backend: ThreeRenderBackend,
    sync: OutlineSyncAccess,
    options: SceneSelectionOutlineOptions,
  ): void {
    if (!options.visible || options.selectedIds.size === 0) {
      backend.setSelectionOutlineTargets([])
      return
    }

    const targets: THREE.Object3D[] = []
    for (const id of options.selectedIds) {
      const object3d = sync.getObject3D(entityId(id))
      if (object3d) targets.push(object3d)
    }

    backend.setSelectionOutlineTargets(targets)
  }

  dispose(backend: ThreeRenderBackend): void {
    backend.setSelectionOutlineTargets([])
  }
}
