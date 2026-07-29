import { describe, expect, it } from 'vitest'
import {
  createInputActionMap,
  type InputActionMapSnapshot,
} from './action-map.js'

const BOUNCE_RUN_BINDINGS = {
  lateral: {
    kind: 'axis',
    negative: ['KeyA', 'ArrowLeft'],
    positive: ['KeyD', 'ArrowRight'],
  },
  restart: { kind: 'pulse', codes: ['KeyR'] },
  pause: { kind: 'pulse', codes: ['Escape'] },
} as const

describe('input action map', () => {
  it('resolves alternate axis bindings and edge-triggered actions', () => {
    const actions = createInputActionMap(BOUNCE_RUN_BINDINGS)

    actions.keyDown('ArrowRight', false)
    actions.keyDown('Escape', false)

    expect(actions.snapshot()).toEqual<InputActionMapSnapshot>({
      lateral: 1,
      restart: false,
      pause: true,
    })

    actions.endFrame()
    actions.keyUp('ArrowRight')
    expect(actions.snapshot()).toEqual({
      lateral: 0,
      restart: false,
      pause: false,
    })
  })

  it('neutralizes opposing axis keys and ignores repeated pulses', () => {
    const actions = createInputActionMap(BOUNCE_RUN_BINDINGS)

    actions.keyDown('KeyA', false)
    actions.keyDown('KeyD', false)
    actions.keyDown('KeyR', true)

    expect(actions.snapshot()).toEqual({
      lateral: 0,
      restart: false,
      pause: false,
    })
  })

  it('rejects action bindings without keyboard codes', () => {
    expect(() =>
      createInputActionMap({
        invalid: { kind: 'pulse', codes: [] },
      }),
    ).toThrow('Input action "invalid" must bind at least one key code')
  })
})
