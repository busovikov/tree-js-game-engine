import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { TransformTool } from '../store/editor-store.js'

/** OrbitControls action disabled — handled elsewhere (e.g. RMB look). */
const MOUSE_NONE = -1 as THREE.MOUSE

export function applyOrbitToolMode(orbit: OrbitControls, tool: TransformTool): void {
  if (tool === 'hand') {
    orbit.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: MOUSE_NONE,
    }
    return
  }

  orbit.mouseButtons = {
    LEFT: MOUSE_NONE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: MOUSE_NONE,
  }
}
