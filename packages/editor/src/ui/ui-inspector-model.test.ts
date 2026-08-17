import { describe, expect, it } from 'vitest'
import { UIDocumentSchema, type UIDocument } from '@haku/ui'
import {
  convertFrameLayout,
  convertUISize,
  explainUISizeMode,
  formatUISize,
  parseUISize,
  updateUIElementStrict,
} from './ui-inspector-model.js'

const DOCUMENT = '15000000-0000-4000-8000-000000000001'
const ROOT = '15000000-0000-4000-8000-000000000002'
const CHILD = '15000000-0000-4000-8000-000000000003'

function document(layout: 'free' | 'vertical' = 'free'): UIDocument {
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: DOCUMENT,
    name: 'Inspector model',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [CHILD],
        layout: { mode: layout, padding: { top: 8, right: 12, bottom: 16, left: 20 } },
        sizing: {
          width: { mode: 'fixed', value: 400, unit: 'px' },
          height: { mode: 'fixed', value: 300, unit: 'px' },
        },
      },
      {
        id: CHILD,
        type: 'rectangle',
        sizing: {
          width: { mode: 'fixed', value: 50, unit: '%' },
          height: { mode: 'hug' },
        },
        placement:
          layout === 'free'
            ? {
                positioning: 'free',
                x: 30,
                y: 40,
                horizontalConstraint: 'left',
                verticalConstraint: 'top',
                referenceWidth: 400,
                referenceHeight: 300,
              }
            : { positioning: 'flow' },
      },
    ],
  })
}

describe('UI Inspector field model', () => {
  it('formats every dimension mode without pixel coercion', () => {
    expect(formatUISize({ mode: 'fixed', value: 100, unit: '%' })).toBe('100%')
    expect(formatUISize({ mode: 'fixed', value: 320, unit: 'px' })).toBe('320')
    expect(formatUISize({ mode: 'hug' })).toBe('auto')
    expect(formatUISize({ mode: 'fill' })).toBe('fill')
  })

  it('parses explicit px, percent, Hug, and Fill values without transient coercion', () => {
    const auto = { isRoot: false, parentLayout: 'vertical' as const, positioning: 'flow' as const }
    expect(parseUISize('240', auto)).toEqual({ mode: 'fixed', value: 240, unit: 'px' })
    expect(parseUISize('75%', auto)).toEqual({ mode: 'fixed', value: 75, unit: '%' })
    expect(parseUISize('auto', auto)).toEqual({ mode: 'hug' })
    expect(parseUISize('fill', auto)).toEqual({ mode: 'fill' })
    expect(() => parseUISize('NaN', auto)).toThrow(/non-negative finite/i)
    expect(() =>
      parseUISize('fill', { ...auto, parentLayout: 'free', positioning: 'free' }),
    ).toThrow(/free layout/i)
  })

  it('converts sizing modes explicitly and explains illegal combinations', () => {
    expect(
      convertUISize({ mode: 'hug' }, 'fixed', {
        measured: 137,
        unit: 'px',
        isRoot: false,
        parentLayout: 'vertical',
        positioning: 'flow',
      }),
    ).toEqual({ mode: 'fixed', value: 137, unit: 'px' })
    expect(
      explainUISizeMode('fill', {
        isRoot: false,
        parentLayout: 'free',
        positioning: 'free',
      }),
    ).toMatch(/free layout/i)
    expect(() =>
      convertUISize({ mode: 'hug' }, 'fill', {
        measured: 100,
        unit: 'px',
        isRoot: true,
        parentLayout: null,
        positioning: 'flow',
      }),
    ).toThrow(/root/i)
  })

  it('converts auto layout to free using measured visual bounds', () => {
    const asset = document('vertical')
    const converted = convertFrameLayout(asset, ROOT, 'free', new Map([
      [ROOT, { x: 100, y: 50, width: 400, height: 300 }],
      [CHILD, { x: 140, y: 90, width: 180, height: 44 }],
    ]))
    const child = converted.elements.find((element) => element.id === CHILD)!

    expect(converted.elements[0]).toMatchObject({ layout: { mode: 'free' } })
    expect(child.placement).toEqual({
      positioning: 'free',
      x: 40,
      y: 40,
      horizontalConstraint: 'left',
      verticalConstraint: 'top',
      referenceWidth: 400,
      referenceHeight: 300,
    })
    expect(child.sizing).toMatchObject({ width: { mode: 'fixed', value: 50, unit: '%' } })
    expect(() => UIDocumentSchema.parse(converted)).not.toThrow()
  })

  it('rejects a whole-document invalid field update atomically', () => {
    const asset = document()
    expect(() =>
      updateUIElementStrict(asset, CHILD, {
        sizing: {
          ...asset.elements[1]!.sizing,
          width: { mode: 'fill' },
        },
      }),
    ).toThrow(/Fill sizing is invalid in free layout/)
    expect(asset.elements[1]!.sizing.width).toEqual({ mode: 'fixed', value: 50, unit: '%' })
  })
})
