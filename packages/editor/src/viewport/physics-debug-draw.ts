import * as THREE from 'three'
import { applyEditorOverlayObject } from './editor-overlay-style.js'

interface PhysicsDebugRenderBuffers {
  vertices: Float32Array
  colors: Float32Array
}

/** Play-mode overlay: Rapier `world.debugRender()` line segments. */
export class ScenePhysicsDebugDraw {
  private object: THREE.LineSegments | null = null

  sync(scene: THREE.Scene, buffers: PhysicsDebugRenderBuffers | null, visible: boolean): void {
    if (!visible || !buffers || buffers.vertices.length === 0) {
      if (this.object) {
        this.object.visible = false
      }
      return
    }

    if (!this.object) {
      const geometry = new THREE.BufferGeometry()
      const material = new THREE.LineBasicMaterial({ vertexColors: true })
      material.toneMapped = false
      this.object = new THREE.LineSegments(geometry, material)
      this.object.userData.hakuEditorOverlay = true
      applyEditorOverlayObject(this.object, 1002)
      scene.add(this.object)
    }

    this.object.visible = true
    const geometry = this.object.geometry
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3))

    const vertexCount = buffers.vertices.length / 3
    const colors = new Float32Array(vertexCount * 3)
    for (let i = 0; i < vertexCount; i++) {
      colors[i * 3] = buffers.colors[i * 4] ?? 1
      colors[i * 3 + 1] = buffers.colors[i * 4 + 1] ?? 1
      colors[i * 3 + 2] = buffers.colors[i * 4 + 2] ?? 1
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.computeBoundingSphere()
  }

  dispose(scene: THREE.Scene): void {
    if (!this.object) return
    scene.remove(this.object)
    this.object.geometry.dispose()
    const material = this.object.material
    if (material instanceof THREE.Material) {
      material.dispose()
    }
    this.object = null
  }
}
