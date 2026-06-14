import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
const _direction = new THREE.Vector3()

export interface CameraLookControls {
  dispose(): void
}

export function attachCameraLookControls(
  domElement: HTMLElement,
  camera: THREE.PerspectiveCamera,
  orbit: OrbitControls,
  options: {
    isEnabled: () => boolean
    rotateSpeed?: number
  },
): CameraLookControls {
  let dragging = false
  let lastX = 0
  let lastY = 0
  const rotateSpeed = options.rotateSpeed ?? 0.005

  const syncOrbitTarget = (): void => {
    const distance = Math.max(camera.position.distanceTo(orbit.target), 0.001)
    camera.getWorldDirection(_direction)
    orbit.target.copy(camera.position).addScaledVector(_direction, distance)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2) return
    if (!options.isEnabled()) return

    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    domElement.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging) return

    const dx = event.clientX - lastX
    const dy = event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY

    _euler.setFromQuaternion(camera.quaternion)
    _euler.y -= dx * rotateSpeed
    _euler.x -= dy * rotateSpeed
    _euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, _euler.x))
    camera.quaternion.setFromEuler(_euler)
    syncOrbitTarget()
    orbit.update()
  }

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return
    dragging = false
    if (domElement.hasPointerCapture(event.pointerId)) {
      domElement.releasePointerCapture(event.pointerId)
    }
  }

  const onContextMenu = (event: Event): void => {
    if (options.isEnabled()) event.preventDefault()
  }

  domElement.addEventListener('pointerdown', onPointerDown)
  domElement.addEventListener('pointermove', onPointerMove)
  domElement.addEventListener('pointerup', endDrag)
  domElement.addEventListener('pointercancel', endDrag)
  domElement.addEventListener('contextmenu', onContextMenu)

  return {
    dispose() {
      domElement.removeEventListener('pointerdown', onPointerDown)
      domElement.removeEventListener('pointermove', onPointerMove)
      domElement.removeEventListener('pointerup', endDrag)
      domElement.removeEventListener('pointercancel', endDrag)
      domElement.removeEventListener('contextmenu', onContextMenu)
    },
  }
}
