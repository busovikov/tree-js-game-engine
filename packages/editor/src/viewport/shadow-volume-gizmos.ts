import * as THREE from 'three'
import { applyEditorOverlayObject } from './editor-overlay-style.js'

/** Editor overlay: wireframe of each directional light's orthographic shadow camera. */
export class SceneShadowVolumeGizmos {
  private readonly helpers = new Map<THREE.DirectionalLight, THREE.CameraHelper>()

  sync(scene: THREE.Scene, visible: boolean): void {
    const lights = new Set<THREE.DirectionalLight>()
    scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight && object.castShadow) {
        lights.add(object)
      }
    })

    for (const light of this.helpers.keys()) {
      if (!lights.has(light)) {
        const helper = this.helpers.get(light)!
        helper.dispose()
        scene.remove(helper)
        this.helpers.delete(light)
      }
    }

    for (const light of lights) {
      let helper = this.helpers.get(light)
      if (!helper) {
        helper = new THREE.CameraHelper(light.shadow.camera)
        helper.userData.hakuEditorOverlay = true
        applyEditorOverlayObject(helper, 1001)
        scene.add(helper)
        this.helpers.set(light, helper)
      }
      helper.visible = visible
      helper.update()
    }
  }

  dispose(scene: THREE.Scene): void {
    for (const helper of this.helpers.values()) {
      helper.dispose()
      scene.remove(helper)
    }
    this.helpers.clear()
  }
}
