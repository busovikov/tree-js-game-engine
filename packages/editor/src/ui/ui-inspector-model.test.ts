import { describe, expect, it } from 'vitest'
import { UIDocumentSchema, type UIDocument, type UIElement } from '@haku/ui'
import {
  convertUIPlacement,
  convertFrameLayout,
  convertUIFixedUnit,
  convertUISize,
  explainUIAccessibilityField,
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
  updateUIElementAccessibility,
  getUIEventBindingSlots,
  updateUIElementStrict,
  updateUIElementStyle,
  updateUIElementEventBinding,
  updateUIImageAccessibility,
  updateUIElementWidget,
} from './ui-inspector-model.js'

const DOCUMENT = '15000000-0000-4000-8000-000000000001'
const ROOT = '15000000-0000-4000-8000-000000000002'
const CHILD = '15000000-0000-4000-8000-000000000003'
const NONE_EVENT = '15000000-0000-4000-8000-000000000010'
const SECOND_NONE_EVENT = '15000000-0000-4000-8000-000000000011'
const STRING_EVENT = '15000000-0000-4000-8000-000000000012'
const NUMBER_EVENT = '15000000-0000-4000-8000-000000000013'
const BOOLEAN_EVENT = '15000000-0000-4000-8000-000000000014'
const UNKNOWN_EVENT = '15000000-0000-4000-8000-000000000099'

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

function elementDocument(
  type: 'image' | 'text-input' | 'text-area' | 'select' | 'slider' | 'progress',
): UIDocument {
  const asset = document('vertical')
  const current = asset.elements[1]!
  const fields =
    type === 'image'
      ? {
          source: {
            $ref: '15000000-0000-4000-8000-000000000004',
            type: '15000000-0000-4000-8000-000000000005',
          },
          alt: 'Preview image',
        }
      : type === 'select'
        ? {
            value: 'one',
            options: [{ value: 'one', label: 'One' }],
            accessibility: { label: 'Choice' },
          }
        : type === 'slider'
          ? { min: 0, max: 10, step: 1, value: 5, accessibility: { label: 'Volume' } }
          : type === 'progress'
            ? { min: 0, max: 10, value: 5, accessibility: { label: 'Loading' } }
            : { value: '', accessibility: { label: type === 'text-input' ? 'Name' : 'Notes' } }
  return UIDocumentSchema.parse({
    ...asset,
    elements: asset.elements.map((element) =>
      element.id === CHILD
        ? {
            id: element.id,
            type,
            ...fields,
            sizing: current.sizing,
            placement: current.placement,
          }
        : element,
    ),
  })
}

function widgetDocument(type: UIElement['type']): UIDocument {
  const asset = document('vertical')
  const current = asset.elements[1]!
  const fields: Record<string, unknown> =
    type === 'text-input'
      ? {
          value: 'Ada',
          placeholder: 'Name',
          maxLength: 12,
          inputMode: 'text',
          accessibility: { label: 'Name' },
        }
      : type === 'text-area'
        ? { value: 'Notes', rows: 4, resize: 'both', accessibility: { label: 'Notes' } }
        : type === 'checkbox'
          ? { value: false, label: 'Accept' }
          : type === 'radio'
            ? { group: 'mode', optionValue: 'easy', value: 'easy', label: 'Easy' }
            : type === 'switch'
              ? { value: true, label: 'Music' }
              : type === 'select'
                ? {
                    value: 'one',
                    placeholder: 'Choose',
                    options: [{ value: 'one', label: 'One', disabled: false }],
                    accessibility: { label: 'Choice' },
                  }
                : type === 'slider'
                  ? { min: 0, max: 10, step: 2, value: 4, accessibility: { label: 'Volume' } }
                  : type === 'progress'
                    ? { min: 0, max: 100, value: 50, accessibility: { label: 'Loading' } }
                    : type === 'divider'
                      ? { orientation: 'horizontal', thickness: 1 }
                      : type === 'list'
                        ? { children: [], ordered: false, layout: { mode: 'vertical' } }
                        : {}
  return UIDocumentSchema.parse({
    ...asset,
    elements: asset.elements.map((element) =>
      element.id === CHILD
        ? { id: element.id, type, ...fields, sizing: current.sizing, placement: current.placement }
        : element,
    ),
  })
}

function eventDocument(type: UIElement['type']): UIDocument {
  const asset = type === 'frame' ? document('vertical') : widgetDocument(type)
  return UIDocumentSchema.parse({
    ...asset,
    events: [
      { id: NONE_EVENT, name: 'No value', payload: 'none' },
      { id: SECOND_NONE_EVENT, name: 'Also no value', payload: 'none' },
      { id: STRING_EVENT, name: 'Text value', payload: 'string' },
      { id: NUMBER_EVENT, name: 'Numeric value', payload: 'number' },
      { id: BOOLEAN_EVENT, name: 'Boolean value', payload: 'boolean' },
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

  it('edits and removes every optional accessibility value without lossy coercion', () => {
    const asset = document()
    const accessible = updateUIElementAccessibility(asset, CHILD, {
      label: 'Score announcement',
      description: 'Updates when the score changes',
      role: 'status',
      live: 'assertive',
      tabIndex: -1,
    })

    expect(accessible.elements[1]!.accessibility).toEqual({
      label: 'Score announcement',
      description: 'Updates when the score changes',
      role: 'status',
      live: 'assertive',
      tabIndex: -1,
    })
    const reset = updateUIElementAccessibility(accessible, CHILD, {
      label: undefined,
      description: undefined,
      role: undefined,
      live: undefined,
      tabIndex: undefined,
    })
    expect(reset.elements[1]!.accessibility).toEqual({})
    expect(() => UIDocumentSchema.parse(reset)).not.toThrow()
  })

  it.each(['text-input', 'text-area', 'select', 'slider', 'progress'] as const)(
    'rejects removal of the required accessible name for %s atomically',
    (type) => {
      const asset = elementDocument(type)
      const before = structuredClone(asset)

      expect(() => updateUIElementAccessibility(asset, CHILD, { label: undefined })).toThrow(
        /accessible label/i,
      )
      expect(() => updateUIElementAccessibility(asset, CHILD, { label: '   ' })).toThrow(
        /accessible label/i,
      )
      expect(asset).toEqual(before)
    },
  )

  it('couples decorative Images and meaningful alt text through strict whole-document edits', () => {
    const asset = elementDocument('image')
    const decorative = updateUIImageAccessibility(asset, CHILD, { decorative: true })

    expect(decorative.elements[1]).toMatchObject({ decorative: true, alt: '' })
    expect(() => updateUIImageAccessibility(decorative, CHILD, { decorative: false })).toThrow(
      /meaningful alt text/i,
    )
    const meaningful = updateUIImageAccessibility(decorative, CHILD, {
      alt: 'A gold star beside the score',
    })
    expect(meaningful.elements[1]).toMatchObject({
      decorative: false,
      alt: 'A gold star beside the score',
    })
    expect(() => updateUIImageAccessibility(meaningful, CHILD, { alt: '   ' })).toThrow(
      /meaningful alt text/i,
    )
    expect(() => UIDocumentSchema.parse(meaningful)).not.toThrow()
  })

  it('explains Image-only controls and required accessible-name removal', () => {
    const text = document().elements[1]!
    const image = elementDocument('image').elements[1]!
    const input = elementDocument('text-input').elements[1]!

    expect(explainUIAccessibilityField(text, 'alt')).toMatch(/Image elements/i)
    expect(explainUIAccessibilityField(image, 'alt')).toBeNull()
    expect(explainUIAccessibilityField(text, 'label-reset')).toBeNull()
    expect(explainUIAccessibilityField(input, 'label-reset')).toMatch(/required/i)
  })

  it.each([
    [
      'text-input',
      {
        value: 'Grace',
        placeholder: 'Full name',
        required: true,
        readOnly: true,
        maxLength: 20,
        inputMode: 'email',
      },
    ],
    [
      'text-area',
      {
        value: 'Long notes',
        placeholder: 'Notes',
        required: true,
        readOnly: true,
        maxLength: 40,
        rows: 6,
        resize: 'horizontal',
      },
    ],
    ['checkbox', { value: true, label: 'Accepted' }],
    ['radio', { group: 'difficulty', optionValue: 'hard', value: 'hard', label: 'Hard' }],
    ['switch', { value: false, label: 'Sound' }],
    [
      'select',
      {
        value: 'two',
        placeholder: 'Pick',
        options: [
          { value: 'one', label: 'One', disabled: true },
          { value: 'two', label: 'Two', disabled: false },
        ],
      },
    ],
    ['slider', { min: -2, max: 10, step: 2, value: 6 }],
    ['progress', { min: -10, max: 10, value: null }],
    ['divider', { orientation: 'vertical', thickness: 2.5 }],
    ['list', { ordered: true }],
  ] as const)('strictly edits every serialized %s widget field', (type, patch) => {
    const updated = updateUIElementWidget(widgetDocument(type), CHILD, patch)
    expect(updated.elements[1]).toMatchObject(patch)
    expect(() => UIDocumentSchema.parse(updated)).not.toThrow()
  })

  it('rejects invalid coupled widget candidates atomically', () => {
    const cases = [
      [widgetDocument('text-input'), { maxLength: 2 }],
      [widgetDocument('checkbox'), { label: '' }],
      [widgetDocument('radio'), { optionValue: '' }],
      [widgetDocument('switch'), { label: '' }],
      [
        widgetDocument('select'),
        {
          options: [
            { value: 'one', label: 'One' },
            { value: 'one', label: 'Duplicate' },
          ],
        },
      ],
      [widgetDocument('select'), { value: 'missing' }],
      [widgetDocument('slider'), { value: 5 }],
      [widgetDocument('slider'), { step: 0 }],
      [widgetDocument('progress'), { min: 100 }],
      [widgetDocument('divider'), { thickness: 0 }],
    ] as const

    for (const [asset, patch] of cases) {
      const before = structuredClone(asset)
      expect(() => updateUIElementWidget(asset, CHILD, patch)).toThrow()
      expect(asset).toEqual(before)
    }
  })

  it('updates a selected Radio option across its group in one strict candidate', () => {
    const asset = widgetDocument('radio')
    const second = {
      ...asset.elements[1],
      id: '15000000-0000-4000-8000-000000000006',
      optionValue: 'hard',
      label: 'Hard',
    }
    const grouped = UIDocumentSchema.parse({
      ...asset,
      elements: [{ ...asset.elements[0], children: [CHILD, second.id] }, asset.elements[1], second],
    })

    const renamed = updateUIElementWidget(grouped, CHILD, { optionValue: 'normal' })
    expect(renamed.elements.slice(1)).toMatchObject([
      { optionValue: 'normal', value: 'normal' },
      { optionValue: 'hard', value: 'normal' },
    ])
  })

  it.each([
    [
      'frame',
      [
        ['focus', 'none'],
        ['blur', 'none'],
      ],
    ],
    ['button', [['activate', 'none']]],
    [
      'text-input',
      [
        ['input', 'string'],
        ['change', 'string'],
        ['submit', 'string'],
        ['focus', 'none'],
        ['blur', 'none'],
      ],
    ],
    [
      'text-area',
      [
        ['input', 'string'],
        ['change', 'string'],
        ['focus', 'none'],
        ['blur', 'none'],
      ],
    ],
    ['checkbox', [['change', 'boolean']]],
    ['radio', [['change', 'string']]],
    ['switch', [['change', 'boolean']]],
    ['select', [['change', 'string']]],
    [
      'slider',
      [
        ['input', 'number'],
        ['change', 'number'],
      ],
    ],
  ] as const)(
    'derives only strict %s event slots and compatible declarations',
    (type, expected) => {
      const asset = eventDocument(type)
      const element = type === 'frame' ? asset.elements[0]! : asset.elements[1]!
      const slots = getUIEventBindingSlots(asset, element)

      expect(slots.map(({ slot, payload }) => [slot, payload])).toEqual(expected)
      for (const candidate of slots) {
        const compatibleIds = candidate.compatibleEvents.map((event) => event.id)
        expect(compatibleIds).toEqual(
          candidate.payload === 'none'
            ? [NONE_EVENT, SECOND_NONE_EVENT]
            : candidate.payload === 'string'
              ? [STRING_EVENT]
              : candidate.payload === 'number'
                ? [NUMBER_EVENT]
                : [BOOLEAN_EVENT],
        )
      }
    },
  )

  it.each([
    'text',
    'image',
    'rectangle',
    'progress',
    'divider',
    'spacer',
    'scroll-container',
    'list',
    'instance',
  ] as const)('derives no event slots for %s', (type) => {
    expect(
      getUIEventBindingSlots(eventDocument('button'), { type, events: {} } as UIElement),
    ).toEqual([])
  })

  it('binds and clears exact event IDs through a complete strict document candidate', () => {
    const asset = eventDocument('button')
    const bound = updateUIElementEventBinding(asset, CHILD, 'activate', SECOND_NONE_EVENT)
    expect(bound.elements[1]!.events).toEqual({ activate: SECOND_NONE_EVENT })
    expect(() => UIDocumentSchema.parse(bound)).not.toThrow()

    const cleared = updateUIElementEventBinding(bound, CHILD, 'activate', undefined)
    expect(cleared.elements[1]!.events).toEqual({})
    expect(() => UIDocumentSchema.parse(cleared)).not.toThrow()
  })

  it('rejects unknown, incompatible, and unsupported event bindings atomically', () => {
    const asset = eventDocument('button')
    const before = structuredClone(asset)

    expect(() => updateUIElementEventBinding(asset, CHILD, 'activate', UNKNOWN_EVENT)).toThrow(
      /unknown UI event/i,
    )
    expect(() => updateUIElementEventBinding(asset, CHILD, 'activate', STRING_EVENT)).toThrow(
      /incompatible payload/i,
    )
    expect(() => updateUIElementEventBinding(asset, CHILD, 'change', NONE_EVENT)).toThrow(
      /unavailable/i,
    )
    expect(asset).toEqual(before)
  })
})
