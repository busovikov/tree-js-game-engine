import * as THREE from 'three'

/** World-space bounds of all meshes under root (skips helpers without geometry). */
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

/**
 * Fit a directional light shadow ortho frustum to scene content.
 * Centers the light target on the bounds and expands the frustum symmetrically.
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

  const center = sceneBounds.getCenter(new THREE.Vector3())
  const size = sceneBounds.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 1) * padding

  const targetParent = light.target.parent
  if (targetParent) {
    targetParent.updateMatrixWorld(true)
    light.target.position.copy(targetParent.worldToLocal(center.clone()))
  } else {
    light.target.position.copy(center)
  }
  light.target.updateMatrixWorld(true)

  camera.left = -maxDim / 2
  camera.right = maxDim / 2
  camera.top = maxDim / 2
  camera.bottom = -maxDim / 2
  camera.near = 0.5
  camera.far = maxDim * 2 + size.y
  camera.updateProjectionMatrix()
}
