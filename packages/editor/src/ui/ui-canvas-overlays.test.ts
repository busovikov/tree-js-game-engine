import { describe, expect, it } from 'vitest'
import { UIDocumentSchema, type UIElementId } from '@haku/ui'
import type { UIRect } from './ui-gesture-transaction.js'
import { deriveUIInsertionOverlay, deriveUISelectionOverlay } from './ui-canvas-overlays.js'

const ROOT = '23000000-0000-4000-8000-000000000101' as UIElementId
const FIRST = '23000000-0000-4000-8000-000000000102' as UIElementId
const SECOND = '23000000-0000-4000-8000-000000000103' as UIElementId
const THIRD = '23000000-0000-4000-8000-000000000104' as UIElementId
const FOURTH = '23000000-0000-4000-8000-000000000105' as UIElementId

const fixedSizing = {
  width: { mode: 'fixed' as const, value: 40, unit: 'px' as const },
  height: { mode: 'fixed' as const, value: 30, unit: 'px' as const },
}

function overlayAsset(mode: 'free' | 'horizontal' | 'vertical' | 'grid' = 'horizontal') {
  const layout =
    mode === 'free'
      ? { mode, padding: { top: 10, right: 20, bottom: 30, left: 40 } }
      : mode === 'grid'
        ? {
            mode,
            columns: 2,
            padding: { top: 10, right: 20, bottom: 30, left: 40 },
            rowGap: 12,
            columnGap: 16,
          }
        : {
            mode,
            wrap: false,
            padding: { top: 10, right: 20, bottom: 30, left: 40 },
            rowGap: 12,
            columnGap: 16,
          }
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: '23000000-0000-4000-8000-000000000100',
    name: 'Overlay geometry',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [FIRST, SECOND, THIRD, FOURTH],
        layout,
        overflowX: 'hidden',
        overflowY: 'scroll',
        sizing: {
          width: { mode: 'fixed', value: 400, unit: 'px' },
          height: { mode: 'fixed', value: 240, unit: 'px' },
        },
      },
      ...[FIRST, SECOND, THIRD, FOURTH].map((id) => ({
        id,
        type: 'text' as const,
        text: id,
        sizing: fixedSizing,
        placement:
          mode === 'free'
            ? {
                positioning: 'free' as const,
                x: 0,
                y: 0,
                horizontalConstraint: 'left' as const,
                verticalConstraint: 'top' as const,
                referenceWidth: 400,
                referenceHeight: 240,
              }
            : { positioning: 'flow' as const },
      })),
    ],
  })
}

function bounds(entries: readonly [UIElementId, UIRect][]) {
  return new Map(entries)
}

describe('UI canvas selection overlays', () => {
  it('derives four padding inset edges and distinct serialized overflow boundaries', () => {
    const asset = overlayAsset()
    const overlay = deriveUISelectionOverlay(
      asset,
      [ROOT],
      bounds([
        [ROOT, { x: 100, y: 50, width: 400, height: 240 }],
        [FIRST, { x: 140, y: 80, width: 40, height: 30 }],
        [SECOND, { x: 196, y: 80, width: 40, height: 30 }],
        [THIRD, { x: 252, y: 80, width: 40, height: 30 }],
        [FOURTH, { x: 308, y: 80, width: 40, height: 30 }],
      ]),
    )

    expect(overlay?.padding).toEqual([
      { side: 'top', x: 140, y: 60, width: 340, height: 0 },
      { side: 'right', x: 480, y: 60, width: 0, height: 200 },
      { side: 'bottom', x: 140, y: 260, width: 340, height: 0 },
      { side: 'left', x: 140, y: 60, width: 0, height: 200 },
    ])
    expect(overlay?.overflow).toEqual([
      { axis: 'x', policy: 'hidden', x: 100, y: 290, width: 400, height: 0 },
      { axis: 'y', policy: 'scroll', x: 500, y: 50, width: 0, height: 240 },
    ])
    expect(overlay?.gaps.map(({ axis, value, x, width }) => ({ axis, value, x, width }))).toEqual([
      { axis: 'column', value: 16, x: 180, width: 16 },
      { axis: 'column', value: 16, x: 236, width: 16 },
      { axis: 'column', value: 16, x: 292, width: 16 },
    ])
  })

  it('derives grid row and column markers only from measured adjacent children', () => {
    const asset = overlayAsset('grid')
    const overlay = deriveUISelectionOverlay(
      asset,
      [ROOT],
      bounds([
        [ROOT, { x: 0, y: 0, width: 260, height: 180 }],
        [FIRST, { x: 20, y: 20, width: 80, height: 40 }],
        [SECOND, { x: 116, y: 20, width: 80, height: 40 }],
        [THIRD, { x: 20, y: 72, width: 80, height: 40 }],
      ]),
    )

    expect(overlay?.gaps).toEqual([
      {
        axis: 'column',
        value: 16,
        beforeId: FIRST,
        afterId: SECOND,
        x: 100,
        y: 40,
        width: 16,
        height: 0,
      },
      {
        axis: 'row',
        value: 12,
        beforeId: FIRST,
        afterId: THIRD,
        x: 60,
        y: 60,
        width: 0,
        height: 12,
      },
    ])

    const missingSecond = deriveUISelectionOverlay(
      asset,
      [ROOT],
      bounds([
        [ROOT, { x: 0, y: 0, width: 260, height: 180 }],
        [FIRST, { x: 20, y: 20, width: 80, height: 40 }],
        [THIRD, { x: 20, y: 72, width: 80, height: 40 }],
      ]),
    )
    expect(
      missingSecond?.gaps.map(({ axis, beforeId, afterId }) => ({ axis, beforeId, afterId })),
    ).toEqual([{ axis: 'row', beforeId: FIRST, afterId: THIRD }])
  })

  it('omits non-applicable selection geometry and preserves free-child constraint geometry', () => {
    const asset = overlayAsset('free')
    const measured = bounds([
      [ROOT, { x: 10, y: 20, width: 400, height: 240 }],
      [FIRST, { x: 50, y: 70, width: 40, height: 30 }],
    ])

    expect(deriveUISelectionOverlay(asset, [], measured)).toBeNull()
    expect(deriveUISelectionOverlay(asset, [ROOT, FIRST], measured)).toBeNull()
    expect(deriveUISelectionOverlay(asset, [ROOT], new Map())).toBeNull()
    expect(deriveUISelectionOverlay(asset, [ROOT], measured)?.gaps).toEqual([])
    expect(deriveUISelectionOverlay(asset, [FIRST], measured)).toEqual({
      rect: { x: 50, y: 70, width: 40, height: 30 },
      padding: [],
      gaps: [],
      overflow: [],
      constraint: {
        horizontalConstraint: 'left',
        verticalConstraint: 'top',
        parentRect: { x: 10, y: 20, width: 400, height: 240 },
        rect: { x: 50, y: 70, width: 40, height: 30 },
      },
    })
  })
})

describe('UI canvas insertion overlay', () => {
  it('uses the resolved horizontal target and index without recomputing insertion intent', () => {
    const asset = overlayAsset('horizontal')
    const measured = bounds([
      [ROOT, { x: 100, y: 50, width: 400, height: 240 }],
      [FIRST, { x: 140, y: 80, width: 40, height: 30 }],
      [SECOND, { x: 196, y: 80, width: 40, height: 30 }],
      [THIRD, { x: 252, y: 80, width: 40, height: 30 }],
      [FOURTH, { x: 308, y: 80, width: 40, height: 30 }],
    ])

    expect(
      deriveUIInsertionOverlay(asset, { parentId: ROOT, insertionIndex: 2 }, measured),
    ).toEqual({
      parentId: ROOT,
      insertionIndex: 2,
      axis: 'x',
      x: 244,
      y: 60,
      width: 0,
      height: 200,
    })
    expect(
      deriveUIInsertionOverlay(asset, { parentId: ROOT, insertionIndex: 0 }, measured)?.x,
    ).toBe(140)
    expect(
      deriveUIInsertionOverlay(asset, { parentId: ROOT, insertionIndex: 4 }, measured)?.x,
    ).toBe(348)
  })

  it('uses the existing non-horizontal insertion axis and rejects absent or free targets', () => {
    const grid = overlayAsset('grid')
    const measured = bounds([
      [ROOT, { x: 0, y: 0, width: 260, height: 180 }],
      [FIRST, { x: 20, y: 20, width: 80, height: 40 }],
      [SECOND, { x: 116, y: 20, width: 80, height: 40 }],
      [THIRD, { x: 20, y: 72, width: 80, height: 40 }],
      [FOURTH, { x: 116, y: 72, width: 80, height: 40 }],
    ])

    expect(deriveUIInsertionOverlay(grid, { parentId: ROOT, insertionIndex: 2 }, measured)).toEqual(
      {
        parentId: ROOT,
        insertionIndex: 2,
        axis: 'y',
        x: 40,
        y: 66,
        width: 200,
        height: 0,
      },
    )
    expect(
      deriveUIInsertionOverlay(
        overlayAsset('free'),
        { parentId: ROOT, insertionIndex: 0 },
        measured,
      ),
    ).toBeNull()
    expect(deriveUIInsertionOverlay(grid, null, measured)).toBeNull()
    expect(
      deriveUIInsertionOverlay(grid, { parentId: ROOT, insertionIndex: 0 }, new Map()),
    ).toBeNull()
  })
})
