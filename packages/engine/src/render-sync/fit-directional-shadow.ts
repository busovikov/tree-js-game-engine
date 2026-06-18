import * as THREE from 'three'

const _center = new THREE.Vector3()
const _size = new THREE.Vector3()
const _lightPos = new THREE.Vector3()
const _targetPos = new THREE.Vector3()
const _lightDir = new THREE.Vector3()
const _lookAt = new THREE.Vector3()
const _up = new THREE.Vector3()

/** World-space bounds of all meshes under root (skips editor overlay helpers). */
export function computeMeshWorldBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  const chunk = new THREE.Box3()

  root.traverse((child) => {
    if (child.userData.hakuEditorOverlay) return
    if (!(child instanceof THREE.Mesh)) return
    if (!child.geometry.boundingBox) {
      child.geometry.computeBoundingBox()
    }
    const geomBox = child.geometry.boundingBox
    if (!geomBox) return
    chunk.copy(geomBox).applyMatrix4(child.matrixWorld)
    box.union(chunk)
  })

  return box
}

/** World-space light direction (normalized, from light toward target). */
export function getDirectionalLightWorldDirection(light: THREE.DirectionalLight): THREE.Vector3 {
  light.getWorldPosition(_lightPos)
  light.target.getWorldPosition(_targetPos)
  return _targetPos.sub(_lightPos).normalize()
}

/**
 * Fit directional shadow ortho frustum to scene content.
 * Only the shadow camera moves — light.target stays fixed so illumination direction
 * does not change when geometry moves.
 */
export function fitDirectionalShadowCamera(
  light: THREE.DirectionalLight,
  sceneBounds: THREE.Box3,
  padding = 1.25,
): void {
  const camera = light.shadow.camera

  if (sceneBounds.isEmpty()) {
    camera.left = -10
    camera.right = 10
    camera.top = 10
    camera.bottom = -10
    camera.near = 0.5
    camera.far = 50
    camera.updateProjectionMatrix()
    return
  }

  sceneBounds.getCenter(_center)
  sceneBounds.getSize(_size)
  const maxDim = Math.max(_size.x, _size.y, _size.z, 1) * padding

  light.getWorldPosition(_lightPos)
  light.target.getWorldPosition(_targetPos)
  _lightDir.subVectors(_targetPos, _lightPos).normalize()

  camera.position.copy(_center)
  _up.set(0, 1, 0)
  if (Math.abs(_lightDir.dot(_up)) > 0.99) {
    _up.set(0, 0, 1)
  }
  _lookAt.copy(_center).add(_lightDir)
  camera.up.copy(_up)
  camera.lookAt(_lookAt)
  camera.updateMatrixWorld(true)

  const half = maxDim / 2
  camera.left = -half
  camera.right = half
  camera.top = half
  camera.bottom = -half
  camera.near = 0.5
  camera.far = maxDim * 2 + _size.y
  camera.updateProjectionMatrix()
}
