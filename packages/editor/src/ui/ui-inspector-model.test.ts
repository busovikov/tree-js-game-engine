import { describe, expect, it } from 'vitest'
import { UIDocumentSchema, type UIDocument } from '@haku/ui'
import {
  convertUIPlacement,
  convertFrameLayout,
  convertUIFixedUnit,
  convertUISize,
  explainUIConstraintEdit,
  explainUIPlacementMode,
  explainUIStyleSection,
  explainUISizeMode,
  formatUISize,
  parseUISize,
  updateUIAbsoluteOffset,
  updateUIFreeConstraint,
  updateUISizingBound,
  updateUICornerRadius,
  updateUIElementStrict,
  updateUIElementStyle,
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
        type: 'text',
        text: 'Styled child',
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
  it('converts Fixed px and percent units from measured bounds without guessing', () => {
    expect(
      convertUIFixedUnit({ mode: 'fixed', value: 50, unit: '%' }, 'px', {
        isRoot: false,
        measured: 200,
        reference: 400,
      }),
    ).toEqual({ mode: 'fixed', value: 200, unit: 'px' })
    expect(
      convertUIFixedUnit({ mode: 'fixed', value: 200, unit: 'px' }, '%', {
        isRoot: false,
        measured: 200,
        reference: 400,
      }),
    ).toEqual({ mode: 'fixed', value: 50, unit: '%' })
    expect(() =>
      convertUIFixedUnit({ mode: 'fixed', value: 200, unit: 'px' }, '%', {
        isRoot: true,
        measured: 200,
        reference: 400,
      }),
    ).toThrow(/root/i)
    expect(() =>
      convertUIFixedUnit({ mode: 'fixed', value: 200, unit: 'px' }, '%', {
        isRoot: false,
        measured: 200,
        reference: 0,
      }),
    ).toThrow(/measured parent/i)
  })

  it('rejects inverted comparable min/max bounds without comparing unlike units', () => {
    const sizing = document().elements[1]!.sizing

    expect(() =>
      updateUISizingBound({ ...sizing, maxWidth: { value: 80, unit: 'px' } }, 'minWidth', {
        value: 120,
        unit: 'px',
      }),
    ).toThrow(/minWidth cannot exceed maxWidth/i)
    expect(
      updateUISizingBound({ ...sizing, maxWidth: { value: 80, unit: '%' } }, 'minWidth', {
        value: 120,
        unit: 'px',
      }),
    ).toMatchObject({
      minWidth: { value: 120, unit: 'px' },
      maxWidth: { value: 80, unit: '%' },
    })
    expect(() =>
      updateUISizingBound(sizing, 'maxHeight', { value: Number.NaN, unit: 'px' }),
    ).toThrow(/finite non-negative/i)
  })

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
    const converted = convertFrameLayout(
      asset,
      ROOT,
      'free',
      new Map([
        [ROOT, { x: 100, y: 50, width: 400, height: 300 }],
        [CHILD, { x: 140, y: 90, width: 180, height: 44 }],
      ]),
    )
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

  it.each([
    ['horizontal', { mode: 'horizontal', wrap: false }],
    ['vertical', { mode: 'vertical', wrap: false }],
    ['grid', { mode: 'grid', columns: 1 }],
  ] as const)('converts free layout to %s with strict flow placement', (mode, layout) => {
    const converted = convertFrameLayout(document('free'), ROOT, mode, new Map())
    const child = converted.elements.find((element) => element.id === CHILD)!

    expect(converted.elements[0]).toMatchObject({ layout })
    expect(child.placement).toEqual({ positioning: 'flow' })
    expect(() => UIDocumentSchema.parse(converted)).not.toThrow()
  })

  it('edits both free-layout constraint axes from measured visual bounds', () => {
    const asset = document('free')
    const bounds = new Map([
      [ROOT, { x: 100, y: 50, width: 480, height: 320 }],
      [CHILD, { x: 145, y: 125, width: 180, height: 44 }],
    ])

    const horizontal = updateUIFreeConstraint(asset, CHILD, 'horizontal', 'right', bounds)
    const vertical = updateUIFreeConstraint(horizontal, CHILD, 'vertical', 'top-bottom', bounds)
    const child = vertical.elements.find((element) => element.id === CHILD)!

    expect(child.placement).toEqual({
      positioning: 'free',
      x: 45,
      y: 75,
      horizontalConstraint: 'right',
      verticalConstraint: 'top-bottom',
      referenceWidth: 480,
      referenceHeight: 320,
    })
    expect(() => UIDocumentSchema.parse(vertical)).not.toThrow()
  })

  it('explains unavailable constraint references and rejects non-finite bounds atomically', () => {
    const asset = document('free')
    const before = structuredClone(asset)

    expect(explainUIConstraintEdit(asset, CHILD, 'horizontal', new Map())).toMatch(
      /measured parent and element bounds/i,
    )
    expect(() =>
      updateUIFreeConstraint(
        asset,
        CHILD,
        'horizontal',
        'scale',
        new Map([
          [ROOT, { x: 0, y: 0, width: Number.NaN, height: 300 }],
          [CHILD, { x: 30, y: 40, width: 100, height: 40 }],
        ]),
      ),
    ).toThrow(/finite positive measured parent width/i)
    expect(asset).toEqual(before)
  })

  it('converts Flow and Absolute placement strictly with measured finite offsets', () => {
    const asset = document('vertical')
    const absolute = convertUIPlacement(
      asset,
      CHILD,
      'absolute',
      new Map([
        [ROOT, { x: 100, y: 50, width: 400, height: 300 }],
        [CHILD, { x: 148, y: 126, width: 180, height: 44 }],
      ]),
    )
    expect(absolute.elements.find((element) => element.id === CHILD)?.placement).toEqual({
      positioning: 'absolute',
      left: 48,
      top: 76,
    })
    expect(() => UIDocumentSchema.parse(absolute)).not.toThrow()

    const flow = convertUIPlacement(absolute, CHILD, 'flow', new Map())
    expect(flow.elements.find((element) => element.id === CHILD)?.placement).toEqual({
      positioning: 'flow',
    })
    expect(() => UIDocumentSchema.parse(flow)).not.toThrow()
  })

  it('disables unavailable placement modes and rejects invalid offsets without mutation', () => {
    const asset = document('vertical')
    const before = structuredClone(asset)

    expect(explainUIPlacementMode(asset, CHILD, 'absolute', new Map())).toMatch(
      /measured parent and element bounds/i,
    )
    expect(() =>
      convertUIPlacement(
        asset,
        CHILD,
        'absolute',
        new Map([
          [ROOT, { x: 0, y: 0, width: 400, height: 300 }],
          [CHILD, { x: Number.POSITIVE_INFINITY, y: 0, width: 100, height: 40 }],
        ]),
      ),
    ).toThrow(/finite measured element bounds/i)
    expect(asset).toEqual(before)

    const absolute = convertUIPlacement(
      asset,
      CHILD,
      'absolute',
      new Map([
        [ROOT, { x: 0, y: 0, width: 400, height: 300 }],
        [CHILD, { x: 30, y: 40, width: 100, height: 40 }],
      ]),
    )
    expect(() => updateUIAbsoluteOffset(absolute, CHILD, 'left', Number.NaN)).toThrow(
      /finite offset/i,
    )
    expect(absolute.elements.find((element) => element.id === CHILD)?.placement).toEqual({
      positioning: 'absolute',
      left: 30,
      top: 40,
    })
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

  it('updates typography, fill, stroke, opacity, and image fit without coercing style values', () => {
    const asset = document()
    const styled = updateUIElementStyle(asset, CHILD, {
      color: '#123456',
      backgroundColor: 'color(display-p3 0.1 0.2 0.3)',
      fontFamily: '"IBM Plex Sans", sans-serif',
      fontSize: 17.5,
      fontWeight: 575,
      fontStyle: 'italic',
      lineHeight: 25.25,
      letterSpacing: -0.75,
      textAlign: 'justify',
      borderColor: 'oklch(70% 0.2 30)',
      borderWidth: 1.5,
      opacity: 0.625,
    })

    expect(styled.elements[1]!.style).toEqual({
      color: '#123456',
      backgroundColor: 'color(display-p3 0.1 0.2 0.3)',
      fontFamily: '"IBM Plex Sans", sans-serif',
      fontSize: 17.5,
      fontWeight: 575,
      fontStyle: 'italic',
      lineHeight: 25.25,
      letterSpacing: -0.75,
      textAlign: 'justify',
      borderColor: 'oklch(70% 0.2 30)',
      borderWidth: 1.5,
      opacity: 0.625,
    })
    expect(() => UIDocumentSchema.parse(styled)).not.toThrow()

    const imageAsset = UIDocumentSchema.parse({
      ...asset,
      elements: asset.elements.map((element) =>
        element.id === CHILD
          ? {
              id: element.id,
              type: 'image',
              source: {
                $ref: '15000000-0000-4000-8000-000000000004',
                type: '15000000-0000-4000-8000-000000000005',
              },
              alt: 'Preview',
              sizing: element.sizing,
              placement: element.placement,
              style: element.style,
              accessibility: element.accessibility,
            }
          : element,
      ),
    })
    expect(
      updateUIElementStyle(imageAsset, CHILD, { objectFit: 'scale-down' }).elements[1]!.style,
    ).toMatchObject({ objectFit: 'scale-down' })
  })

  it('expands scalar radius losslessly and rejects invalid numeric styles atomically', () => {
    const asset = updateUIElementStyle(document(), CHILD, { borderRadius: 8 })
    const rounded = updateUICornerRadius(asset, CHILD, 'topLeft', 12.5)

    expect(rounded.elements[1]!.style.borderRadius).toEqual({
      topLeft: 12.5,
      topRight: 8,
      bottomRight: 8,
      bottomLeft: 8,
    })
    expect(() => UIDocumentSchema.parse(rounded)).not.toThrow()

    for (const patch of [
      { fontSize: Number.NaN },
      { fontSize: 0 },
      { fontWeight: 450.5 },
      { lineHeight: Number.POSITIVE_INFINITY },
      { letterSpacing: Number.NaN },
      { borderWidth: -1 },
      { opacity: 1.01 },
    ]) {
      expect(() => updateUIElementStyle(asset, CHILD, patch)).toThrow()
      expect(asset.elements[1]!.style).toEqual({ borderRadius: 8 })
    }
    expect(() => updateUICornerRadius(asset, CHILD, 'bottomRight', Number.NaN)).toThrow(
      /finite non-negative/i,
    )
    expect(asset.elements[1]!.style).toEqual({ borderRadius: 8 })
  })

  it('removes optional style values intentionally and explains type-specific sections', () => {
    const asset = updateUIElementStyle(document(), CHILD, {
      fontFamily: 'Inter',
      opacity: 0.5,
    })
    const reset = updateUIElementStyle(asset, CHILD, {
      fontFamily: undefined,
      opacity: undefined,
    })
    const text = reset.elements[1]!
    const frame = reset.elements[0]!

    expect(text.style).toEqual({})
    expect(explainUIStyleSection(text, 'typography')).toBeNull()
    expect(explainUIStyleSection(text, 'image-fit')).toMatch(/Image/i)
    expect(explainUIStyleSection(frame, 'typography')).toMatch(/text content/i)
  })
})
