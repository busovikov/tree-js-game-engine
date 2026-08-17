import { describe, expect, it } from 'vitest'
import type { UISizing } from '@haku/ui'
import {
  beginUIGesture,
  cancelUIGesture,
  clampUIRect,
  commitUIGesture,
  previewUIGesture,
  resizeDimensionIntent,
  snapUIRect,
} from './ui-gesture-transaction.js'

describe('UI gesture transaction', () => {
  it('previews without replacing the committed value and cancels exactly', () => {
    const before = { x: 12, y: 20, width: 100, height: 40 }
    const started = beginUIGesture(before)
    const previewed = previewUIGesture(started, { ...before, x: 47, width: 140 })

    expect(started.before).toEqual(before)
    expect(previewed.before).toEqual(before)
    expect(previewed.preview).toEqual({ x: 47, y: 20, width: 140, height: 40 })
    expect(cancelUIGesture(previewed)).toEqual(before)
  })

  it('commits one final value only when the preview changed', () => {
    const before = { x: 12, y: 20, width: 100, height: 40 }
    expect(commitUIGesture(beginUIGesture(before))).toEqual({ changed: false, value: before })
    expect(
      commitUIGesture(previewUIGesture(beginUIGesture(before), { ...before, y: 30 })),
    ).toEqual({ changed: true, value: { ...before, y: 30 } })
  })
})

describe('UI snapping and constraints', () => {
  it('uses parent edge, peer edge, center, parent padding, then equal-gap priority', () => {
    const rect = { x: 48, y: 80, width: 100, height: 40 }
    const snapped = snapUIRect(
      rect,
      [
        { axis: 'x', delta: 2, kind: 'equal-gap', guide: 150 },
        { axis: 'x', delta: 3, kind: 'center', guide: 151 },
        { axis: 'x', delta: 4, kind: 'peer-edge', guide: 152 },
        { axis: 'x', delta: 5, kind: 'parent-edge', guide: 153 },
        { axis: 'y', delta: -2, kind: 'parent-padding', guide: 78 },
      ],
      6,
    )

    expect(snapped.rect).toEqual({ x: 53, y: 78, width: 100, height: 40 })
    expect(snapped.guides.map((guide) => guide.kind)).toEqual(['parent-edge', 'parent-padding'])
  })

  it('bypasses snapping with the platform modifier', () => {
    const rect = { x: 48, y: 80, width: 100, height: 40 }
    expect(
      snapUIRect(rect, [{ axis: 'x', delta: 2, kind: 'peer-edge', guide: 50 }], 6, true),
    ).toEqual({ rect, guides: [] })
  })

  it('clamps movement and resize to parent plus pixel and percent min/max bounds', () => {
    expect(
      clampUIRect(
        { x: -20, y: 190, width: 240, height: 5 },
        { width: 300, height: 200 },
        {
          minWidth: { value: 50, unit: '%' },
          maxWidth: { value: 200, unit: 'px' },
          minHeight: { value: 20, unit: 'px' },
        },
      ),
    ).toEqual({ x: 0, y: 180, width: 200, height: 20 })
  })
})

describe('UI resize dimension intent', () => {
  it('converts only the deliberately resized axis to fixed px', () => {
    const sizing: UISizing = {
      width: { mode: 'fixed', value: 50, unit: '%' },
      height: { mode: 'hug' },
    }

    expect(resizeDimensionIntent(sizing, 'width', 320)).toEqual({
      width: { mode: 'fixed', value: 320, unit: 'px' },
      height: { mode: 'hug' },
    })
    expect(resizeDimensionIntent(sizing, 'height', 48)).toEqual({
      width: { mode: 'fixed', value: 50, unit: '%' },
      height: { mode: 'fixed', value: 48, unit: 'px' },
    })
  })
})
