import { describe, expect, it } from 'vitest'
import {
  applyUIInstanceOverride,
  uiInstanceLocatorKey,
  type UIElement,
  type UIElementId,
} from './index.js'

const id = (value: number): UIElementId =>
  `24000000-0000-4000-8000-${value.toString().padStart(12, '0')}` as UIElementId

describe('component instance semantics', () => {
  it('resolves sparse values without changing structure or replacing nested records', () => {
    const source = {
      id: id(1),
      type: 'button',
      name: 'Action',
      text: 'Continue',
      visible: true,
      enabled: true,
      sizing: { width: { mode: 'hug' }, height: { mode: 'hug' } },
      placement: { positioning: 'flow' },
      style: { color: '#fff', backgroundColor: '#123' },
      accessibility: { label: 'Continue action', tabIndex: 0 },
      events: {},
    } satisfies UIElement

    expect(
      applyUIInstanceOverride(source, {
        text: 'Retry',
        style: { color: '#f00' },
        accessibility: { label: 'Retry action' },
      }),
    ).toEqual({
      ...source,
      text: 'Retry',
      style: { color: '#f00', backgroundColor: '#123' },
      accessibility: { label: 'Retry action', tabIndex: 0 },
    })
  })

  it('formats nested runtime locators deterministically and rejects an empty path', () => {
    expect(uiInstanceLocatorKey({ instancePath: [id(2), id(3)], sourceElementId: id(4) })).toBe(
      `${id(2)}/${id(3)}:${id(4)}`,
    )
    expect(() => uiInstanceLocatorKey({ instancePath: [], sourceElementId: id(4) })).toThrow(
      'at least one instance',
    )
  })
})
