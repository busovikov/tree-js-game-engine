import { describe, expect, it } from 'vitest'
import { UIDocumentSchema } from './schema.js'

const id = (value: number): string =>
  `21000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const ROOT = id(1)
const EVENT_NONE = id(80)
const EVENT_STRING = id(81)
const EVENT_NUMBER = id(82)
const EVENT_BOOLEAN = id(83)

function baseDocument() {
  return {
    schemaVersion: 2,
    id: id(90),
    name: 'UI v2',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [],
        layout: { mode: 'vertical' },
        sizing: {
          width: { mode: 'fixed', value: 1280, unit: 'px' },
          height: { mode: 'fixed', value: 720, unit: 'px' },
        },
      },
    ],
    components: [],
    events: [
      { id: EVENT_NONE, name: 'activate', payload: 'none' },
      { id: EVENT_STRING, name: 'string', payload: 'string' },
      { id: EVENT_NUMBER, name: 'number', payload: 'number' },
      { id: EVENT_BOOLEAN, name: 'boolean', payload: 'boolean' },
    ],
    themes: [],
  }
}

function leaf(idValue: number, type: string, extra: Record<string, unknown> = {}) {
  return { id: id(idValue), type, ...extra }
}

describe('UIDocumentSchema version 2', () => {
  it('is the sole contract and clearly rejects version 1/container documents', () => {
    expect(UIDocumentSchema.safeParse(baseDocument()).success).toBe(true)
    const versionOne = {
      ...baseDocument(),
      schemaVersion: 1,
      elements: [{ id: ROOT, type: 'container', children: [] }],
    }
    const result = UIDocumentSchema.safeParse(versionOne)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join('\n')).toMatch(/2|frame/i)
    }
  })

  it('accepts every required primitive and widget with typed bindings and values', () => {
    const elements = [
      {
        ...baseDocument().elements[0],
        children: Array.from({ length: 18 }, (_, index) => id(index + 2)),
      },
      leaf(2, 'frame', { children: [], layout: { mode: 'horizontal', wrap: true } }),
      leaf(3, 'text', { text: 'Text' }),
      leaf(4, 'image', { source: { $ref: id(91) }, alt: 'A useful image' }),
      leaf(5, 'button', {
        text: 'Run',
        accessibility: { label: 'Run action' },
        events: { activate: EVENT_NONE },
      }),
      leaf(6, 'rectangle'),
      leaf(7, 'text-input', {
        value: 'hello',
        accessibility: { label: 'Name' },
        events: { input: EVENT_STRING, change: EVENT_STRING, submit: EVENT_STRING },
      }),
      leaf(8, 'text-area', { value: 'notes', accessibility: { label: 'Notes' } }),
      leaf(9, 'checkbox', {
        value: true,
        label: 'Accept',
        events: { change: EVENT_BOOLEAN },
      }),
      leaf(10, 'radio', {
        group: 'difficulty',
        optionValue: 'easy',
        value: 'easy',
        label: 'Easy',
        events: { change: EVENT_STRING },
      }),
      leaf(11, 'switch', {
        value: false,
        label: 'Music',
        events: { change: EVENT_BOOLEAN },
      }),
      leaf(12, 'select', {
        value: 'one',
        accessibility: { label: 'Choice' },
        options: [{ value: 'one', label: 'One' }],
        events: { change: EVENT_STRING },
      }),
      leaf(13, 'slider', {
        min: 0,
        max: 10,
        step: 1,
        value: 4,
        accessibility: { label: 'Volume' },
        events: { input: EVENT_NUMBER, change: EVENT_NUMBER },
      }),
      leaf(14, 'progress', { min: 0, max: 1, value: 0.5, accessibility: { label: 'Load' } }),
      leaf(15, 'divider', { orientation: 'horizontal', thickness: 1 }),
      leaf(16, 'spacer'),
      leaf(17, 'scroll-container', {
        children: [],
        layout: { mode: 'vertical' },
        overflowX: 'hidden',
        overflowY: 'auto',
      }),
      leaf(18, 'list', { children: [], ordered: false, layout: { mode: 'vertical' } }),
      leaf(19, 'text', { text: 'Tail' }),
    ]
    const result = UIDocumentSchema.safeParse({ ...baseDocument(), elements })
    if (!result.success)
      throw new Error(result.error.issues.map((issue) => issue.message).join('\n'))
    expect(result.success).toBe(true)
  })

  it.each([
    [
      'duplicate IDs',
      (value: ReturnType<typeof baseDocument>) => ({
        ...value,
        elements: [...value.elements, { ...value.elements[0] }],
      }),
      /Duplicate UI element ID/,
    ],
    [
      'unknown child',
      (value: ReturnType<typeof baseDocument>) => ({
        ...value,
        elements: [{ ...value.elements[0], children: [id(999)] }],
      }),
      /Unknown UI child/,
    ],
    [
      'unreachable element',
      (value: ReturnType<typeof baseDocument>) => ({
        ...value,
        elements: [...value.elements, leaf(2, 'text', { text: 'lost' })],
      }),
      /unreachable/,
    ],
    [
      'non-frame root',
      (value: ReturnType<typeof baseDocument>) => ({
        ...value,
        elements: [leaf(1, 'text', { text: 'root' })],
      }),
      /root.*frame/i,
    ],
  ])('rejects %s', (_name, mutate, message) => {
    const result = UIDocumentSchema.safeParse(mutate(baseDocument()))
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message).join('\n')).toMatch(message)
  })

  it('rejects invalid layout/sizing, widget ranges/options, bindings, and accessibility', () => {
    const invalids = [
      { ...leaf(2, 'text', { text: 'fill' }), sizing: { width: { mode: 'fill' } } },
      leaf(2, 'slider', { min: 5, max: 1, step: 0, value: 3, accessibility: { label: 'Bad' } }),
      leaf(2, 'select', {
        value: 'missing',
        accessibility: { label: 'Bad select' },
        options: [
          { value: 'same', label: 'One' },
          { value: 'same', label: 'Two' },
        ],
      }),
      leaf(2, 'button', { text: 'No name', events: { activate: EVENT_STRING } }),
      leaf(2, 'image', { source: { $ref: id(91) }, alt: '' }),
    ]
    for (const invalid of invalids) {
      const result = UIDocumentSchema.safeParse({
        ...baseDocument(),
        elements: [
          { ...baseDocument().elements[0], children: [id(2)], layout: { mode: 'free' } },
          {
            ...invalid,
            placement: {
              positioning: 'free',
              x: 0,
              y: 0,
              horizontalConstraint: 'left',
              verticalConstraint: 'top',
              referenceWidth: 1280,
              referenceHeight: 720,
            },
          },
        ],
      })
      expect(result.success).toBe(false)
    }
  })

  it.each(['text-input', 'text-area', 'select', 'slider', 'progress'] as const)(
    'rejects a whitespace-only accessible name for %s',
    (type) => {
      const fields =
        type === 'select'
          ? { value: 'one', options: [{ value: 'one', label: 'One' }] }
          : type === 'slider'
            ? { min: 0, max: 10, step: 1, value: 5 }
            : type === 'progress'
              ? { min: 0, max: 10, value: 5 }
              : { value: '' }
      const result = UIDocumentSchema.safeParse({
        ...baseDocument(),
        elements: [
          { ...baseDocument().elements[0], children: [id(2)] },
          leaf(2, type, { ...fields, accessibility: { label: '   ' } }),
        ],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message).join('\n')).toMatch(
          /accessible label/i,
        )
      }
    },
  )

  it.each(['text-input', 'text-area'] as const)(
    'rejects a %s initial value longer than maxLength',
    (type) => {
      const result = UIDocumentSchema.safeParse({
        ...baseDocument(),
        elements: [
          { ...baseDocument().elements[0], children: [id(2)] },
          leaf(2, type, {
            value: 'too long',
            maxLength: 3,
            accessibility: { label: 'Limited value' },
          }),
        ],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message).join('\n')).toMatch(/maxLength/i)
      }
    },
  )

  it('rejects Fill sizing on absolute-positioned auto-layout children', () => {
    const child = id(2)
    const result = UIDocumentSchema.safeParse({
      ...baseDocument(),
      elements: [
        {
          ...baseDocument().elements[0],
          children: [child],
          layout: { mode: 'vertical' },
        },
        leaf(2, 'text', {
          text: 'Overlay',
          placement: { positioning: 'absolute', left: 12, top: 16 },
          sizing: { width: { mode: 'fill' } },
        }),
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join('\n')).toMatch(
        /Fill sizing is invalid for absolute positioning/i,
      )
    }
  })

  it('accepts nested acyclic component instances and rejects cycles and structural overrides', () => {
    const componentA = id(60)
    const componentB = id(61)
    const aRoot = id(62)
    const bRoot = id(63)
    const instance = id(64)
    const valid = {
      ...baseDocument(),
      elements: [
        { ...baseDocument().elements[0], children: [instance] },
        leaf(64, 'instance', {
          component: componentA,
          overrides: { [aRoot]: { name: 'Override' } },
        }),
      ],
      components: [
        {
          id: componentA,
          name: 'A',
          root: aRoot,
          elements: [
            leaf(62, 'frame', { children: [bRoot], layout: { mode: 'vertical' } }),
            leaf(63, 'instance', { component: componentB }),
          ],
        },
        {
          id: componentB,
          name: 'B',
          root: id(65),
          elements: [leaf(65, 'text', { text: 'Nested' })],
        },
      ],
    }
    const validResult = UIDocumentSchema.safeParse(valid)
    if (!validResult.success)
      throw new Error(validResult.error.issues.map((issue) => issue.message).join('\n'))
    expect(validResult.success).toBe(true)

    const cyclic = structuredClone(valid)
    cyclic.components[1]!.elements = [leaf(65, 'instance', { component: componentA })]
    expect(UIDocumentSchema.safeParse(cyclic).success).toBe(false)

    const structural = structuredClone(valid)
    ;(structural.elements[1] as Record<string, unknown>).overrides = {
      [aRoot]: { children: [] },
    }
    expect(UIDocumentSchema.safeParse(structural).success).toBe(false)
  })

  it('accepts sparse instance overrides and rejects values incompatible with the source widget', () => {
    const component = id(60)
    const componentRoot = id(61)
    const input = id(62)
    const checkbox = id(63)
    const radioA = id(64)
    const radioB = id(65)
    const select = id(66)
    const slider = id(67)
    const progress = id(68)
    const instance = id(69)
    const elements = [
      leaf(61, 'frame', {
        children: [input, checkbox, radioA, radioB, select, slider, progress],
        layout: { mode: 'vertical' },
      }),
      leaf(62, 'text-input', {
        value: 'short',
        maxLength: 5,
        accessibility: { label: 'Name' },
      }),
      leaf(63, 'checkbox', { value: false, label: 'Accept' }),
      leaf(64, 'radio', {
        group: 'mode',
        optionValue: 'a',
        value: 'a',
        label: 'Mode A',
      }),
      leaf(65, 'radio', {
        group: 'mode',
        optionValue: 'b',
        value: 'a',
        label: 'Mode B',
      }),
      leaf(66, 'select', {
        value: 'one',
        accessibility: { label: 'Choice' },
        options: [{ value: 'one', label: 'One' }],
      }),
      leaf(67, 'slider', {
        min: 0,
        max: 10,
        step: 2,
        value: 4,
        accessibility: { label: 'Volume' },
      }),
      leaf(68, 'progress', {
        min: 0,
        max: 100,
        value: 50,
        accessibility: { label: 'Loading' },
      }),
    ]
    const candidate = (overrides: Record<string, unknown>) => ({
      ...baseDocument(),
      elements: [
        { ...baseDocument().elements[0], children: [instance] },
        leaf(69, 'instance', { component, overrides }),
      ],
      components: [{ id: component, name: 'Controls', root: componentRoot, elements }],
    })

    expect(UIDocumentSchema.safeParse(candidate({ [checkbox]: { visible: false } })).success).toBe(
      true,
    )
    expect(
      UIDocumentSchema.safeParse(
        candidate({
          [radioA]: { value: 'b' },
          [radioB]: { value: 'b' },
        }),
      ).success,
    ).toBe(true)

    const invalidOverrides = [
      { [input]: { value: 'too long' } },
      { [checkbox]: { value: 'true' } },
      { [radioA]: { value: 'missing' } },
      { [radioB]: { value: 'b' } },
      { [select]: { value: 'missing' } },
      { [slider]: { value: 11 } },
      { [slider]: { value: 5 } },
      { [progress]: { value: -1 } },
    ]
    for (const overrides of invalidOverrides) {
      expect(UIDocumentSchema.safeParse(candidate(overrides)).success).toBe(false)
    }
  })

  it('rejects instance override event slots and payloads incompatible with the source element', () => {
    const component = id(60)
    const componentRoot = id(61)
    const button = id(62)
    const checkbox = id(63)
    const instance = id(64)
    const candidate = (overrides: Record<string, unknown>) => ({
      ...baseDocument(),
      elements: [
        { ...baseDocument().elements[0], children: [instance] },
        leaf(64, 'instance', { component, overrides }),
      ],
      components: [
        {
          id: component,
          name: 'Actions',
          root: componentRoot,
          elements: [
            leaf(61, 'frame', { children: [button, checkbox], layout: { mode: 'vertical' } }),
            leaf(62, 'button', { text: 'Run' }),
            leaf(63, 'checkbox', { value: false, label: 'Accept' }),
          ],
        },
      ],
    })

    expect(
      UIDocumentSchema.safeParse(candidate({ [button]: { events: { activate: EVENT_NONE } } }))
        .success,
    ).toBe(true)
    expect(
      UIDocumentSchema.safeParse(candidate({ [button]: { events: { change: EVENT_NONE } } }))
        .success,
    ).toBe(false)
    expect(
      UIDocumentSchema.safeParse(candidate({ [button]: { events: { activate: EVENT_STRING } } }))
        .success,
    ).toBe(false)
    expect(
      UIDocumentSchema.safeParse(candidate({ [checkbox]: { events: { change: EVENT_STRING } } }))
        .success,
    ).toBe(false)
    expect(
      UIDocumentSchema.safeParse(candidate({ [checkbox]: { events: { change: id(999) } } }))
        .success,
    ).toBe(false)
  })
})
