import { entityId, type EntityId } from '@haku/core'
import * as THREE from 'three'
import { SelectionEdgeSync } from './selection-edge-sync.js'

interface OutlineSyncAccess {
  getObject3D(id: EntityId): THREE.Object3D | undefined
}

export interface SceneSelectionOutlineOptions {
  visible: boolean
  selectedIds: ReadonlySet<string>
}

export class SceneSelectionOutline {
  private readonly edges = new SelectionEdgeSync()

  sync(sync: OutlineSyncAccess, options: SceneSelectionOutlineOptions): void {
    if (!options.visible || options.selectedIds.size === 0) {
      this.edges.setTargets([])
      return
    }

    const targets: THREE.Object3D[] = []
    for (const id of options.selectedIds) {
      const object3d = sync.getObject3D(entityId(id))
      if (object3d) targets.push(object3d)
    }

    this.edges.setTargets(targets)
  }

  dispose(): void {
    this.edges.dispose()
  }
}
