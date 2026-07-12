import * as THREE from 'three'
import { applyEditorOverlayObject } from './editor-overlay-style.js'

/** Cap far plane for editor visualization — avoids depth clipping and z-fighting on long lines. */
export function frustumDisplayDistance(near: number, far: number): number {
  const minimum = Math.max(near * 8, 2)
  const maximum = 30
  return Math.min(far, Math.max(minimum, Math.min(maximum, far)))
}

function setSegment(
  positions: THREE.BufferAttribute,
  index: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): void {
  positions.setXYZ(index * 2, ax, ay, az)
  positions.setXYZ(index * 2 + 1, bx, by, bz)
}

function writeFrustumCorners(
  positions: THREE.BufferAttribute,
  camera: THREE.PerspectiveCamera,
  far: number,
): void {
  const near = camera.near
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
  const nearHalfH = near * tanHalfFov
  const nearHalfW = nearHalfH * camera.aspect
  const farHalfH = far * tanHalfFov
  const farHalfW = farHalfH * camera.aspect

  const n1x = -nearHalfW
  const n1y = -nearHalfH
  const nz = -near
  const n2x = nearHalfW
  const n2y = -nearHalfH
  const n3x = -nearHalfW
  const n3y = nearHalfH
  const n4x = nearHalfW
  const n4y = nearHalfH

  const f1x = -farHalfW
  const f1y = -farHalfH
  const fz = -far
  const f2x = farHalfW
  const f2y = -farHalfH
  const f3x = -farHalfW
  const f3y = farHalfH
  const f4x = farHalfW
  const f4y = farHalfH

  setSegment(positions, 0, n1x, n1y, nz, n2x, n2y, nz)
  setSegment(positions, 1, n2x, n2y, nz, n4x, n4y, nz)
  setSegment(positions, 2, n4x, n4y, nz, n3x, n3y, nz)
  setSegment(positions, 3, n3x, n3y, nz, n1x, n1y, nz)

  setSegment(positions, 4, f1x, f1y, fz, f2x, f2y, fz)
  setSegment(positions, 5, f2x, f2y, fz, f4x, f4y, fz)
  setSegment(positions, 6, f4x, f4y, fz, f3x, f3y, fz)
  setSegment(positions, 7, f3x, f3y, fz, f1x, f1y, fz)

  setSegment(positions, 8, n1x, n1y, nz, f1x, f1y, fz)
  setSegment(positions, 9, n2x, n2y, nz, f2x, f2y, fz)
  setSegment(positions, 10, n3x, n3y, nz, f3x, f3y, fz)
  setSegment(positions, 11, n4x, n4y, nz, f4x, f4y, fz)

  positions.needsUpdate = true
}

export class EditorCameraFrustumHelper extends THREE.LineSegments {
  readonly camera: THREE.PerspectiveCamera

  constructor(camera: THREE.PerspectiveCamera) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 2 * 3), 3))

    const material = new THREE.LineBasicMaterial({
      color: 0x6699cc,
      toneMapped: false,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    })

    super(geometry, material)

    this.camera = camera
    this.frustumCulled = false
    this.renderOrder = 1000
    this.userData.hakuEditorOverlay = true
    applyEditorOverlayObject(this)

    camera.add(this)
    this.updateGeometry()
  }

  updateGeometry(): void {
    this.camera.updateProjectionMatrix()
    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const far = frustumDisplayDistance(this.camera.near, this.camera.far)
    writeFrustumCorners(positions, this.camera, far)
  }

  setStyle(color: number, opacity: number): void {
    const material = this.material as THREE.LineBasicMaterial
    material.color.set(color)
    material.opacity = opacity
  }

  disposeHelper(): void {
    this.removeFromParent()
    this.geometry.dispose()
    if (Array.isArray(this.material)) {
      this.material.forEach((m) => m.dispose())
    } else {
      this.material.dispose()
    }
  }
}
