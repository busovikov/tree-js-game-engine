/** Runtime action axes produced by {@link InputManager} (AD-07 v1). */
export interface InputActions {
  /** Throttle axis −1 (reverse) … 1 (forward). */
  throttle: number
  /** Steer axis −1 (left) … 1 (right). */
  steer: number
  /** Handbrake while Space is held. */
  brake: boolean
  /** Boost while Shift is held. */
  boost: boolean
  /** Jump pulse on Space keydown (cleared after {@link InputManager.endFrame}). */
  jump: boolean
  /** Respawn pulse on R keydown (cleared after {@link InputManager.endFrame}). */
  respawn: boolean
  /** Pointer drag delta since last {@link InputManager.endFrame}. */
  cameraOrbitDelta: Readonly<{ dx: number; dy: number }>
  /** Wheel delta since last {@link InputManager.endFrame} (positive = zoom out). */
  cameraZoomDelta: number
}

export const DEFAULT_INPUT_ACTIONS: InputActions = {
  throttle: 0,
  steer: 0,
  brake: false,
  boost: false,
  jump: false,
  respawn: false,
  cameraOrbitDelta: { dx: 0, dy: 0 },
  cameraZoomDelta: 0,
}

/** Keyboard codes mapped to directional / modifier actions (WASD + arrows). */
export const KEY_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  boost: ['ShiftLeft', 'ShiftRight'],
  handbrake: ['Space'],
} as const

export type DirectionalKeyAction = keyof typeof KEY_BINDINGS
