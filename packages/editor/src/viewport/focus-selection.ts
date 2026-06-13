import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as THREE from 'three'

export function focusSelection(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  orbit: OrbitControls,
): void {
  object.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(object)
  const center = new THREE.Vector3()

  if (box.isEmpty()) {
    object.getWorldPosition(center)
  } else {
    box.getCenter(center)
  }

  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(size.length() * 0.5, 0.5)

  orbit.target.copy(center)

  const offset = new THREE.Vector3().subVectors(camera.position, orbit.target)
  if (offset.lengthSq() < 1e-6) offset.set(1, 0.75, 1)
  offset.normalize().multiplyScalar(Math.max(radius * 2.5, 2))

  camera.position.copy(center).add(offset)
  orbit.update()
}
