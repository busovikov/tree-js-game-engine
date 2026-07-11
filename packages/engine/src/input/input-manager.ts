import {
  DEFAULT_INPUT_ACTIONS,
  KEY_BINDINGS,
  type DirectionalKeyAction,
  type InputActions,
} from './input-actions.js'

export type { InputActions } from './input-actions.js'
export { DEFAULT_INPUT_ACTIONS, KEY_BINDINGS } from './input-actions.js'

/** Target that supports pointer capture for camera orbit drag. */
export interface PointerCaptureTarget extends EventTarget {
  setPointerCapture?(pointerId: number): void
  releasePointerCapture?(pointerId: number): void
  hasPointerCapture?(pointerId: number): boolean
}

export interface InputManagerOptions {
  /** Keyboard target (default: `window` when available). */
  keyboardTarget?: EventTarget
  /** Pointer + wheel target (default: same as keyboard target). */
  pointerTarget?: PointerCaptureTarget
}

interface KeyLikeEvent {
  code: string
  repeat: boolean
  preventDefault(): void
  target: EventTarget | null
}

interface PointerLikeEvent {
  button: number
  clientX: number
  clientY: number
  pointerId: number
}

interface WheelLikeEvent {
  deltaY: number
  preventDefault(): void
}

const CODE_TO_ACTION = new Map<string, DirectionalKeyAction>()
for (const [action, codes] of Object.entries(KEY_BINDINGS) as [DirectionalKeyAction, readonly string[]][]) {
  for (const code of codes) {
    CODE_TO_ACTION.set(code, action)
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as { tagName?: string; isContentEditable?: boolean }
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true
}

function axisFromHeld(codes: readonly string[], pressed: ReadonlySet<string>): number {
  return codes.some((code) => pressed.has(code)) ? 1 : 0
}

/**
 * Play-mode keyboard + pointer input (AD-07 v1).
 * Attach listeners once; toggle {@link enable}/{@link disable} with play mode.
 */
export class InputManager {
  private keyboardTarget: EventTarget | null = null
  private pointerTarget: PointerCaptureTarget | null = null
  private readonly defaultKeyboardTarget: EventTarget | undefined
  private readonly defaultPointerTarget: PointerCaptureTarget | undefined

  private attached = false
  private enabled = false

  private readonly pressed = new Set<string>()
  private jumpPulse = false
  private respawnPulse = false
  private orbitDx = 0
  private orbitDy = 0
  private zoomDelta = 0
  private dragging = false
  private lastPointerX = 0
  private lastPointerY = 0

  private readonly onKeyDown = (event: Event) => this.handleKeyDown(event as unknown as KeyLikeEvent)
  private readonly onKeyUp = (event: Event) => this.handleKeyUp(event as unknown as KeyLikeEvent)
  private readonly onPointerDown = (event: Event) => this.handlePointerDown(event as unknown as PointerLikeEvent)
  private readonly onPointerMove = (event: Event) => this.handlePointerMove(event as unknown as PointerLikeEvent)
  private readonly onPointerUp = (event: Event) => this.stopPointerDrag(event as unknown as PointerLikeEvent)
  private readonly onPointerCancel = (event: Event) => this.stopPointerDrag(event as unknown as PointerLikeEvent)
  private readonly onWheel = (event: Event) => this.handleWheel(event as unknown as WheelLikeEvent)

  constructor(options: InputManagerOptions = {}) {
    this.defaultKeyboardTarget = options.keyboardTarget
    this.defaultPointerTarget = options.pointerTarget
  }

  get isAttached(): boolean {
    return this.attached
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  /** Register DOM listeners. Idempotent. */
  attach(options: InputManagerOptions = {}): void {
    if (this.attached) return

    this.keyboardTarget =
      options.keyboardTarget ?? this.defaultKeyboardTarget ?? (typeof window !== 'undefined' ? window : null)
    this.pointerTarget =
      options.pointerTarget ??
      this.defaultPointerTarget ??
      (this.keyboardTarget as PointerCaptureTarget | null)

    if (!this.keyboardTarget) {
      throw new Error('InputManager.attach requires a keyboard target')
    }

    this.keyboardTarget.addEventListener('keydown', this.onKeyDown)
    this.keyboardTarget.addEventListener('keyup', this.onKeyUp)

    if (this.pointerTarget) {
      this.pointerTarget.addEventListener('pointerdown', this.onPointerDown)
      this.pointerTarget.addEventListener('pointermove', this.onPointerMove)
      this.pointerTarget.addEventListener('pointerup', this.onPointerUp)
      this.pointerTarget.addEventListener('pointercancel', this.onPointerCancel)
      this.pointerTarget.addEventListener('wheel', this.onWheel, { passive: false })
    }

    this.attached = true
  }

  /** Remove listeners and release all input state. */
  detach(): void {
    if (!this.attached) return

    this.disable()
    this.keyboardTarget?.removeEventListener('keydown', this.onKeyDown)
    this.keyboardTarget?.removeEventListener('keyup', this.onKeyUp)
    this.pointerTarget?.removeEventListener('pointerdown', this.onPointerDown)
    this.pointerTarget?.removeEventListener('pointermove', this.onPointerMove)
    this.pointerTarget?.removeEventListener('pointerup', this.onPointerUp)
    this.pointerTarget?.removeEventListener('pointercancel', this.onPointerCancel)
    this.pointerTarget?.removeEventListener('wheel', this.onWheel)

    this.keyboardTarget = null
    this.pointerTarget = null
    this.attached = false
  }

  /** Activate input processing (play mode enter). */
  enable(): void {
    this.enabled = true
  }

  /** Deactivate and release all held keys / pointer state (play mode pause/exit). */
  disable(): void {
    this.enabled = false
    this.releaseAll()
  }

  /** Current action snapshot from held keys and accumulated pointer deltas. */
  getActions(): InputActions {
    if (!this.enabled) {
      return { ...DEFAULT_INPUT_ACTIONS }
    }

    const forward = axisFromHeld(KEY_BINDINGS.forward, this.pressed)
    const backward = axisFromHeld(KEY_BINDINGS.backward, this.pressed)
    const left = axisFromHeld(KEY_BINDINGS.left, this.pressed)
    const right = axisFromHeld(KEY_BINDINGS.right, this.pressed)

    let throttle = 0
    if (forward && !backward) throttle = 1
    else if (backward && !forward) throttle = -1

    let steer = 0
    if (right && !left) steer = 1
    else if (left && !right) steer = -1

    const boost = KEY_BINDINGS.boost.some((code) => this.pressed.has(code))
    const brake = KEY_BINDINGS.handbrake.some((code) => this.pressed.has(code))

    return {
      throttle,
      steer,
      brake,
      boost,
      jump: this.jumpPulse,
      respawn: this.respawnPulse,
      cameraOrbitDelta: { dx: this.orbitDx, dy: this.orbitDy },
      cameraZoomDelta: this.zoomDelta,
    }
  }

  /** Clear per-frame pulses and pointer deltas; call once per simulation frame. */
  endFrame(): void {
    this.jumpPulse = false
    this.respawnPulse = false
    this.orbitDx = 0
    this.orbitDy = 0
    this.zoomDelta = 0
  }

  private handleKeyDown(event: KeyLikeEvent): void {
    if (!this.enabled || isTypingTarget(event.target)) return

    const action = CODE_TO_ACTION.get(event.code)
    if (action) {
      this.pressed.add(event.code)
      event.preventDefault()
    }

    if (event.code === 'Space' && !event.repeat) {
      this.jumpPulse = true
      event.preventDefault()
    }

    if (event.code === 'KeyR' && !event.repeat) {
      this.respawnPulse = true
      event.preventDefault()
    }
  }

  private handleKeyUp(event: KeyLikeEvent): void {
    if (!this.enabled) return

    const action = CODE_TO_ACTION.get(event.code)
    if (action) {
      this.pressed.delete(event.code)
    }
  }

  private handlePointerDown(event: PointerLikeEvent): void {
    if (!this.enabled || event.button !== 0) return

    this.dragging = true
    this.lastPointerX = event.clientX
    this.lastPointerY = event.clientY
    this.pointerTarget?.setPointerCapture?.(event.pointerId)
  }

  private handlePointerMove(event: PointerLikeEvent): void {
    if (!this.enabled || !this.dragging) return

    const dx = event.clientX - this.lastPointerX
    const dy = event.clientY - this.lastPointerY
    this.lastPointerX = event.clientX
    this.lastPointerY = event.clientY
    this.orbitDx += dx
    this.orbitDy += dy
  }

  private handleWheel(event: WheelLikeEvent): void {
    if (!this.enabled) return
    event.preventDefault()
    this.zoomDelta += event.deltaY
  }

  private stopPointerDrag(event: PointerLikeEvent): void {
    this.dragging = false
    if (this.pointerTarget?.hasPointerCapture?.(event.pointerId)) {
      this.pointerTarget.releasePointerCapture?.(event.pointerId)
    }
  }

  private releaseAll(): void {
    this.pressed.clear()
    this.jumpPulse = false
    this.respawnPulse = false
    this.orbitDx = 0
    this.orbitDy = 0
    this.zoomDelta = 0
    this.dragging = false
  }
}
