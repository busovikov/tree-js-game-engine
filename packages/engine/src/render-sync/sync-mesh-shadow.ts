import type { MeshRenderer } from '@haku/schema'
import * as THREE from 'three'

export function syncMeshShadowFlags(object3d: THREE.Object3D, meshRenderer: MeshRenderer): void {
  object3d.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = meshRenderer.castShadow ?? true
      child.receiveShadow = meshRenderer.receiveShadow ?? true
    }
  })
}
