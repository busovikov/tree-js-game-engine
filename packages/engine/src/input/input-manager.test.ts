import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { InputManager, type PointerCaptureTarget } from './input-manager.js'

type Listener = (event: unknown) => void

class MockEventTarget {
  private listeners = new Map<string, Set<Listener>>()
  private captures = new Set<number>()

  addEventListener(type: string, listener: Listener, _options?: unknown): void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string, event: unknown): void {
    const set = this.listeners.get(type)
    if (!set) return
    for (const listener of [...set]) {
      listener(event)
    }
  }

  setPointerCapture(pointerId: number): void {
    this.captures.add(pointerId)
  }

  releasePointerCapture(pointerId: number): void {
    this.captures.delete(pointerId)
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.captures.has(pointerId)
  }
}

function keyEvent(code: string, type: 'keydown' | 'keyup', repeat = false) {
  return {
    code,
    repeat,
    preventDefault: () => {},
    target: null,
    type,
  }
}

function pointerEvent(
  type: string,
  overrides: Partial<{ button: number; clientX: number; clientY: number; pointerId: number }> = {},
) {
  return {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    ...overrides,
    type,
  }
}

describe('InputManager', () => {
  let keyboard: MockEventTarget
  let pointer: MockEventTarget
  let input: InputManager

  beforeEach(() => {
    keyboard = new MockEventTarget()
    pointer = new MockEventTarget()
    input = new InputManager({
      keyboardTarget: keyboard as unknown as EventTarget,
      pointerTarget: pointer as unknown as PointerCaptureTarget,
    })
    input.attach()
    input.enable()
  })

  afterEach(() => {
    input.detach()
  })

  describe('key state machine', () => {
    it('tracks key down/up for mapped bindings', () => {
      keyboard.dispatch('keydown', keyEvent('KeyW', 'keydown'))
      expect(input.getActions().throttle).toBe(1)

      keyboard.dispatch('keyup', keyEvent('KeyW', 'keyup'))
      expect(input.getActions().throttle).toBe(0)
    })

    it('resolves opposing throttle keys to neutral', () => {
      keyboard.dispatch('keydown', keyEvent('KeyW', 'keydown'))
      keyboard.dispatch('keydown', keyEvent('KeyS', 'keydown'))
      expect(input.getActions().throttle).toBe(0)
    })

    it('maps arrow keys to throttle and steer', () => {
      keyboard.dispatch('keydown', keyEvent('ArrowUp', 'keydown'))
      keyboard.dispatch('keydown', keyEvent('ArrowRight', 'keydown'))
      const actions = input.getActions()
      expect(actions.throttle).toBe(1)
      expect(actions.steer).toBe(1)
    })

    it('tracks boost on Shift and brake on Space', () => {
      keyboard.dispatch('keydown', keyEvent('ShiftLeft', 'keydown'))
      keyboard.dispatch('keydown', keyEvent('Space', 'keydown'))
      const actions = input.getActions()
      expect(actions.boost).toBe(true)
      expect(actions.brake).toBe(true)
    })

    it('ignores events while disabled but keeps attach state', () => {
      input.disable()
      keyboard.dispatch('keydown', keyEvent('KeyW', 'keydown'))
      expect(input.getActions().throttle).toBe(0)
      expect(input.isAttached).toBe(true)
    })

    it('releases held keys on disable', () => {
      keyboard.dispatch('keydown', keyEvent('KeyW', 'keydown'))
      expect(input.getActions().throttle).toBe(1)
      input.disable()
      expect(input.getActions().throttle).toBe(0)
    })

    it('does not process keys before enable (play mode)', () => {
      input.disable()
      input.enable()
      keyboard.dispatch('keydown', keyEvent('KeyD', 'keydown'))
      expect(input.getActions().steer).toBe(1)
    })
  })

  describe('action map pulses', () => {
    it('fires jump pulse on Space keydown without repeat', () => {
      keyboard.dispatch('keydown', keyEvent('Space', 'keydown'))
      expect(input.getActions().jump).toBe(true)

      keyboard.dispatch('keydown', keyEvent('Space', 'keydown', true))
      input.endFrame()
      expect(input.getActions().jump).toBe(false)
    })

    it('fires respawn pulse on R keydown', () => {
      keyboard.dispatch('keydown', keyEvent('KeyR', 'keydown'))
      expect(input.getActions().respawn).toBe(true)
      input.endFrame()
      expect(input.getActions().respawn).toBe(false)
    })
  })

  describe('pointer delta', () => {
    it('accumulates orbit delta while dragging', () => {
      pointer.dispatch('pointerdown', pointerEvent('pointerdown', { clientX: 10, clientY: 20 }))
      pointer.dispatch('pointermove', pointerEvent('pointermove', { clientX: 15, clientY: 25 }))

      const actions = input.getActions()
      expect(actions.cameraOrbitDelta).toEqual({ dx: 5, dy: 5 })
    })

    it('accumulates wheel zoom delta', () => {
      pointer.dispatch('wheel', { deltaY: 120, preventDefault: () => {} })
      pointer.dispatch('wheel', { deltaY: -40, preventDefault: () => {} })
      expect(input.getActions().cameraZoomDelta).toBe(80)
    })

    it('clears pointer deltas on endFrame', () => {
      pointer.dispatch('pointerdown', pointerEvent('pointerdown'))
      pointer.dispatch('pointermove', pointerEvent('pointermove', { clientX: 3, clientY: 4 }))
      pointer.dispatch('wheel', { deltaY: 10, preventDefault: () => {} })
      input.endFrame()
      const actions = input.getActions()
      expect(actions.cameraOrbitDelta).toEqual({ dx: 0, dy: 0 })
      expect(actions.cameraZoomDelta).toBe(0)
    })

    it('ignores pointer input when disabled', () => {
      input.disable()
      pointer.dispatch('pointerdown', pointerEvent('pointerdown'))
      pointer.dispatch('pointermove', pointerEvent('pointermove', { clientX: 10, clientY: 10 }))
      expect(input.getActions().cameraOrbitDelta).toEqual({ dx: 0, dy: 0 })
    })
  })

  describe('attach / detach', () => {
    it('returns neutral actions when not enabled', () => {
      input.disable()
      const actions = input.getActions()
      expect(actions.throttle).toBe(0)
      expect(actions.steer).toBe(0)
      expect(actions.boost).toBe(false)
      expect(actions.jump).toBe(false)
    })

    it('releaseAll on detach clears state', () => {
      keyboard.dispatch('keydown', keyEvent('KeyW', 'keydown'))
      input.detach()
      input.attach()
      input.enable()
      expect(input.getActions().throttle).toBe(0)
    })
  })
})
