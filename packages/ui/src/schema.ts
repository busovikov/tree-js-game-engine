import { TEXTURE_ASSET_TYPE, collectAssetReferences, type AssetTypeDescriptor } from '@haku/assets'
import {
  AssetIdSchema,
  AssetRefSchema,
  assetTypeId,
  type AssetId,
  type AssetRef,
} from '@haku/schema'
import { z } from 'zod'

export const UI_DOCUMENT_ASSET_TYPE = assetTypeId('20000000-0000-4000-8000-000000000009')

export declare const UIElementIdBrand: unique symbol
export type UIElementId = string & { readonly [UIElementIdBrand]: true }
export declare const UIComponentIdBrand: unique symbol
export type UIComponentId = string & { readonly [UIComponentIdBrand]: true }
export declare const UIEventIdBrand: unique symbol
export type UIEventId = string & { readonly [UIEventIdBrand]: true }
export declare const UIThemeIdBrand: unique symbol
export type UIThemeId = string & { readonly [UIThemeIdBrand]: true }

const brandedUuid = <T>() =>
  z
    .string()
    .uuid()
    .transform((value) => value as T)
export const UIElementIdSchema = brandedUuid<UIElementId>()
export const UIComponentIdSchema = brandedUuid<UIComponentId>()
export const UIEventIdSchema = brandedUuid<UIEventId>()
export const UIThemeIdSchema = brandedUuid<UIThemeId>()

const finite = z.number().finite()
const nonnegativeFinite = finite.nonnegative()
const positiveFinite = finite.positive()

export const UIFixedSizeSchema = z
  .object({
    mode: z.literal('fixed'),
    value: nonnegativeFinite,
    unit: z.enum(['px', '%']),
  })
  .strict()
export const UISizeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('hug') }).strict(),
  z.object({ mode: z.literal('fill') }).strict(),
  UIFixedSizeSchema,
])
export type UISize = z.infer<typeof UISizeSchema>

export const UIBoundSchema = z
  .object({ value: nonnegativeFinite, unit: z.enum(['px', '%']) })
  .strict()
export type UIBound = z.infer<typeof UIBoundSchema>

export const UISizingSchema = z
  .object({
    width: UISizeSchema.default({ mode: 'hug' }),
    height: UISizeSchema.default({ mode: 'hug' }),
    minWidth: UIBoundSchema.optional(),
    maxWidth: UIBoundSchema.optional(),
    minHeight: UIBoundSchema.optional(),
    maxHeight: UIBoundSchema.optional(),
  })
  .strict()
  .default({})
export type UISizing = z.infer<typeof UISizingSchema>

export const UIEdgesSchema = z
  .object({
    top: nonnegativeFinite.default(0),
    right: nonnegativeFinite.default(0),
    bottom: nonnegativeFinite.default(0),
    left: nonnegativeFinite.default(0),
  })
  .strict()
  .default({})
export type UIEdges = z.infer<typeof UIEdgesSchema>

const distribution = z.enum([
  'start',
  'center',
  'end',
  'space-between',
  'space-around',
  'space-evenly',
])
const alignment = z.enum(['start', 'center', 'end', 'stretch'])
const autoLayoutFields = {
  padding: UIEdgesSchema,
  rowGap: nonnegativeFinite.default(0),
  columnGap: nonnegativeFinite.default(0),
  distribution: distribution.default('start'),
  alignment: alignment.default('stretch'),
}
export const UILayoutSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('free'), padding: UIEdgesSchema }).strict(),
  z
    .object({
      mode: z.literal('horizontal'),
      ...autoLayoutFields,
      wrap: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      mode: z.literal('vertical'),
      ...autoLayoutFields,
      wrap: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      mode: z.literal('grid'),
      ...autoLayoutFields,
      columns: z.number().int().positive().default(1),
    })
    .strict(),
])
export type UILayout = z.infer<typeof UILayoutSchema>

export const UIPlacementSchema = z.union([
  z.object({ positioning: z.literal('flow') }).strict(),
  z
    .object({
      positioning: z.literal('free'),
      x: finite,
      y: finite,
      horizontalConstraint: z.enum(['left', 'right', 'left-right', 'center', 'scale']),
      verticalConstraint: z.enum(['top', 'bottom', 'top-bottom', 'center', 'scale']),
      referenceWidth: positiveFinite,
      referenceHeight: positiveFinite,
    })
    .strict(),
  z
    .object({
      positioning: z.literal('absolute'),
      top: finite.optional(),
      right: finite.optional(),
      bottom: finite.optional(),
      left: finite.optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 1, 'Absolute placement requires an offset'),
])
export type UIPlacement = z.infer<typeof UIPlacementSchema>

const cornerRadii = z
  .object({
    topLeft: nonnegativeFinite.default(0),
    topRight: nonnegativeFinite.default(0),
    bottomRight: nonnegativeFinite.default(0),
    bottomLeft: nonnegativeFinite.default(0),
  })
  .strict()

export const UIStyleSchema = z
  .object({
    color: z.string().min(1).optional(),
    backgroundColor: z.string().min(1).optional(),
    fontFamily: z.string().min(1).optional(),
    fontSize: positiveFinite.optional(),
    fontWeight: z.union([z.number().int().min(1).max(1000), z.enum(['normal', 'bold'])]).optional(),
    fontStyle: z.enum(['normal', 'italic']).optional(),
    lineHeight: positiveFinite.optional(),
    letterSpacing: finite.optional(),
    textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
    padding: UIEdgesSchema.optional(),
    margin: UIEdgesSchema.optional(),
    borderColor: z.string().min(1).optional(),
    borderWidth: nonnegativeFinite.optional(),
    borderRadius: z.union([nonnegativeFinite, cornerRadii]).optional(),
    opacity: finite.min(0).max(1).optional(),
    cursor: z.enum(['auto', 'default', 'pointer', 'text', 'not-allowed']).optional(),
    objectFit: z.enum(['contain', 'cover', 'fill', 'none', 'scale-down']).optional(),
  })
  .strict()
export type UIStyle = z.infer<typeof UIStyleSchema>

export const UIAccessibilitySchema = z
  .object({
    label: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, 'Accessible label must contain text')
      .optional(),
    description: z.string().min(1).optional(),
    role: z
      .enum([
        'application',
        'banner',
        'complementary',
        'contentinfo',
        'group',
        'main',
        'region',
        'status',
      ])
      .optional(),
    live: z.enum(['off', 'polite', 'assertive']).optional(),
    tabIndex: z.union([z.literal(0), z.literal(-1)]).optional(),
  })
  .strict()
export type UIAccessibility = z.infer<typeof UIAccessibilitySchema>

const UIElementBaseSchema = z.object({
  id: UIElementIdSchema,
  name: z.string().min(1).optional(),
  visible: z.boolean().default(true),
  enabled: z.boolean().default(true),
  sizing: UISizingSchema,
  placement: UIPlacementSchema.default({ positioning: 'flow' }),
  style: UIStyleSchema.default({}),
  accessibility: UIAccessibilitySchema.default({}),
})

const containerFields = {
  children: z.array(UIElementIdSchema).default([]),
  layout: UILayoutSchema.default({ mode: 'free', padding: {} }),
}
const eventBindings = <T extends z.ZodRawShape>(shape: T) => {
  const schema = z.object(shape).strict()
  return schema.default({} as z.input<typeof schema>)
}

export const UIFrameElementSchema = UIElementBaseSchema.extend({
  type: z.literal('frame'),
  ...containerFields,
  overflowX: z.enum(['visible', 'hidden', 'auto', 'scroll']).default('visible'),
  overflowY: z.enum(['visible', 'hidden', 'auto', 'scroll']).default('visible'),
  events: eventBindings({ focus: UIEventIdSchema.optional(), blur: UIEventIdSchema.optional() }),
}).strict()

export const UITextElementSchema = UIElementBaseSchema.extend({
  type: z.literal('text'),
  text: z.string().default(''),
  wrap: z.boolean().default(true),
  events: eventBindings({}),
}).strict()

export const UIImageElementSchema = UIElementBaseSchema.extend({
  type: z.literal('image'),
  source: AssetRefSchema,
  alt: z.string().default(''),
  decorative: z.boolean().default(false),
  events: eventBindings({}),
}).strict()

export const UIButtonElementSchema = UIElementBaseSchema.extend({
  type: z.literal('button'),
  text: z.string().min(1).default('Button'),
  events: eventBindings({ activate: UIEventIdSchema.optional() }),
}).strict()

export const UIRectangleElementSchema = UIElementBaseSchema.extend({
  type: z.literal('rectangle'),
  events: eventBindings({}),
}).strict()

const textControlFields = {
  value: z.string().default(''),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  readOnly: z.boolean().default(false),
  maxLength: z.number().int().positive().optional(),
}

export const UITextInputElementSchema = UIElementBaseSchema.extend({
  type: z.literal('text-input'),
  ...textControlFields,
  inputMode: z
    .enum(['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'])
    .default('text'),
  events: eventBindings({
    input: UIEventIdSchema.optional(),
    change: UIEventIdSchema.optional(),
    submit: UIEventIdSchema.optional(),
    focus: UIEventIdSchema.optional(),
    blur: UIEventIdSchema.optional(),
  }),
}).strict()

export const UITextAreaElementSchema = UIElementBaseSchema.extend({
  type: z.literal('text-area'),
  ...textControlFields,
  rows: z.number().int().positive().default(3),
  resize: z.enum(['none', 'both', 'horizontal', 'vertical']).default('vertical'),
  events: eventBindings({
    input: UIEventIdSchema.optional(),
    change: UIEventIdSchema.optional(),
    focus: UIEventIdSchema.optional(),
    blur: UIEventIdSchema.optional(),
  }),
}).strict()

export const UICheckboxElementSchema = UIElementBaseSchema.extend({
  type: z.literal('checkbox'),
  value: z.boolean().default(false),
  label: z.string().min(1),
  events: eventBindings({ change: UIEventIdSchema.optional() }),
}).strict()

export const UIRadioElementSchema = UIElementBaseSchema.extend({
  type: z.literal('radio'),
  group: z.string().min(1),
  optionValue: z.string().min(1),
  value: z.string().min(1).nullable().default(null),
  label: z.string().min(1),
  events: eventBindings({ change: UIEventIdSchema.optional() }),
}).strict()

export const UISwitchElementSchema = UIElementBaseSchema.extend({
  type: z.literal('switch'),
  value: z.boolean().default(false),
  label: z.string().min(1),
  events: eventBindings({ change: UIEventIdSchema.optional() }),
}).strict()

export const UISelectElementSchema = UIElementBaseSchema.extend({
  type: z.literal('select'),
  value: z.string().nullable().default(null),
  placeholder: z.string().optional(),
  options: z
    .array(
      z
        .object({
          value: z.string().min(1),
          label: z.string().min(1),
          disabled: z.boolean().default(false),
        })
        .strict(),
    )
    .min(1),
  events: eventBindings({ change: UIEventIdSchema.optional() }),
}).strict()

export const UISliderElementSchema = UIElementBaseSchema.extend({
  type: z.literal('slider'),
  min: finite,
  max: finite,
  step: positiveFinite,
  value: finite,
  events: eventBindings({ input: UIEventIdSchema.optional(), change: UIEventIdSchema.optional() }),
}).strict()

export const UIProgressElementSchema = UIElementBaseSchema.extend({
  type: z.literal('progress'),
  min: finite,
  max: finite,
  value: finite.nullable().default(null),
  events: eventBindings({}),
}).strict()

export const UIDividerElementSchema = UIElementBaseSchema.extend({
  type: z.literal('divider'),
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
  thickness: positiveFinite.default(1),
  events: eventBindings({}),
}).strict()

export const UISpacerElementSchema = UIElementBaseSchema.extend({
  type: z.literal('spacer'),
  events: eventBindings({}),
}).strict()

export const UIScrollContainerElementSchema = UIElementBaseSchema.extend({
  type: z.literal('scroll-container'),
  ...containerFields,
  overflowX: z.enum(['hidden', 'auto', 'scroll']).default('auto'),
  overflowY: z.enum(['hidden', 'auto', 'scroll']).default('auto'),
  events: eventBindings({}),
}).strict()

export const UIListElementSchema = UIElementBaseSchema.extend({
  type: z.literal('list'),
  ...containerFields,
  ordered: z.boolean().default(false),
  overflowX: z.enum(['visible', 'hidden', 'auto', 'scroll']).default('visible'),
  overflowY: z.enum(['visible', 'hidden', 'auto', 'scroll']).default('visible'),
  events: eventBindings({}),
}).strict()

export const UIInstanceOverrideSchema = z
  .object({
    name: z.string().min(1).optional(),
    text: z.string().optional(),
    value: z.union([z.string(), finite, z.boolean(), z.null()]).optional(),
    visible: z.boolean().optional(),
    enabled: z.boolean().optional(),
    style: UIStyleSchema.optional(),
    accessibility: UIAccessibilitySchema.optional(),
    events: z
      .object({
        activate: UIEventIdSchema.optional(),
        input: UIEventIdSchema.optional(),
        change: UIEventIdSchema.optional(),
        submit: UIEventIdSchema.optional(),
        focus: UIEventIdSchema.optional(),
        blur: UIEventIdSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
export type UIInstanceOverride = z.infer<typeof UIInstanceOverrideSchema>

export const UIInstanceElementSchema = UIElementBaseSchema.extend({
  type: z.literal('instance'),
  component: UIComponentIdSchema,
  overrides: z.record(UIElementIdSchema, UIInstanceOverrideSchema).default({}),
  events: eventBindings({}),
}).strict()

export const UIElementSchema = z.discriminatedUnion('type', [
  UIFrameElementSchema,
  UITextElementSchema,
  UIImageElementSchema,
  UIButtonElementSchema,
  UIRectangleElementSchema,
  UITextInputElementSchema,
  UITextAreaElementSchema,
  UICheckboxElementSchema,
  UIRadioElementSchema,
  UISwitchElementSchema,
  UISelectElementSchema,
  UISliderElementSchema,
  UIProgressElementSchema,
  UIDividerElementSchema,
  UISpacerElementSchema,
  UIScrollContainerElementSchema,
  UIListElementSchema,
  UIInstanceElementSchema,
])
export type UIElement = z.infer<typeof UIElementSchema>

export const UIEventDefinitionSchema = z
  .object({
    id: UIEventIdSchema,
    name: z.string().min(1),
    payload: z.enum(['none', 'string', 'number', 'boolean']),
  })
  .strict()
export type UIEventDefinition = z.infer<typeof UIEventDefinitionSchema>

export const UIThemeSchema = z
  .object({
    id: UIThemeIdSchema,
    name: z.string().min(1),
    styles: z.record(UIElementIdSchema, UIStyleSchema).default({}),
  })
  .strict()
export type UITheme = z.infer<typeof UIThemeSchema>

export const UIComponentDefinitionSchema = z
  .object({
    id: UIComponentIdSchema,
    name: z.string().min(1),
    root: UIElementIdSchema,
    elements: z.array(UIElementSchema).min(1),
  })
  .strict()
export type UIComponentDefinition = z.infer<typeof UIComponentDefinitionSchema>

const UIDocumentObjectSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: AssetIdSchema,
    name: z.string().min(1),
    root: UIElementIdSchema,
    elements: z.array(UIElementSchema).min(1),
    components: z.array(UIComponentDefinitionSchema).default([]),
    events: z.array(UIEventDefinitionSchema).default([]),
    themes: z.array(UIThemeSchema).default([]),
    defaultTheme: UIThemeIdSchema.optional(),
  })
  .strict()

export interface UIDocument {
  readonly schemaVersion: 2
  readonly id: AssetId
  readonly name: string
  readonly root: UIElementId
  readonly elements: UIElement[]
  readonly components: UIComponentDefinition[]
  readonly events: UIEventDefinition[]
  readonly themes: UITheme[]
  readonly defaultTheme?: UIThemeId
}

const CONTAINER_TYPES = new Set<UIElement['type']>(['frame', 'scroll-container', 'list'])
const VALUE_TYPES = new Set<UIElement['type']>([
  'text-input',
  'text-area',
  'checkbox',
  'radio',
  'switch',
  'select',
  'slider',
  'progress',
])

function childrenOf(element: UIElement): readonly UIElementId[] {
  return CONTAINER_TYPES.has(element.type)
    ? (element as Extract<UIElement, { children: UIElementId[] }>).children
    : []
}

function validateBounds(
  sizing: UISizing,
  path: (string | number)[],
  context: z.RefinementCtx,
): void {
  for (const axis of ['Width', 'Height'] as const) {
    const min = sizing[`min${axis}`]
    const max = sizing[`max${axis}`]
    if (min && max && min.unit === max.unit && min.value > max.value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, `min${axis}`],
        message: `UI min${axis} cannot exceed max${axis}`,
      })
    }
  }
}

function validateTree(
  rootId: UIElementId,
  input: readonly UIElement[],
  path: (string | number)[],
  context: z.RefinementCtx,
  requireFrameRoot: boolean,
): Map<UIElementId, UIElement> {
  const elements = new Map<UIElementId, UIElement>()
  for (const [index, element] of input.entries()) {
    if (elements.has(element.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index, 'id'],
        message: `Duplicate UI element ID: ${element.id}`,
      })
    }
    elements.set(element.id, element)
    validateBounds(element.sizing, [...path, index, 'sizing'], context)
  }
  const root = elements.get(rootId)
  if (!root || (requireFrameRoot && root.type !== 'frame')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path.slice(0, -1), 'root'],
      message: requireFrameRoot
        ? 'UI root must reference a frame element'
        : 'UI component root must reference an element',
    })
    return elements
  }

  const parents = new Map<UIElementId, UIElementId>()
  for (const [index, element] of input.entries()) {
    for (const [childIndex, child] of childrenOf(element).entries()) {
      if (!elements.has(child)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, index, 'children', childIndex],
          message: `Unknown UI child: ${child}`,
        })
      }
      const previous = parents.get(child)
      if (previous) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, index, 'children', childIndex],
          message: `UI element ${child} already has parent ${previous}`,
        })
      }
      parents.set(child, element.id)
    }
  }
  if (parents.has(rootId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'UI root cannot have a parent' })
  }

  const visited = new Set<UIElementId>()
  const visiting = new Set<UIElementId>()
  const visit = (id: UIElementId): void => {
    if (visiting.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `UI hierarchy cycle at ${id}`,
      })
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    const element = elements.get(id)
    if (element) for (const child of childrenOf(element)) visit(child)
    visiting.delete(id)
    visited.add(id)
  }
  visit(rootId)
  for (const [index, element] of input.entries()) {
    if (!visited.has(element.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index],
        message: `UI element ${element.id} is unreachable from root`,
      })
    }
  }

  for (const [index, parent] of input.entries()) {
    if (!CONTAINER_TYPES.has(parent.type)) continue
    const layout = (parent as Extract<UIElement, { layout: UILayout }>).layout
    for (const childId of childrenOf(parent)) {
      const child = elements.get(childId)
      if (!child) continue
      if (layout.mode === 'free') {
        if (child.placement.positioning !== 'free') {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, index, 'children'],
            message: `Child ${child.id} of a free frame requires free placement`,
          })
        }
        if (child.sizing.width.mode === 'fill' || child.sizing.height.mode === 'fill') {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, index, 'children'],
            message: `Fill sizing is invalid in free layout for ${child.id}`,
          })
        }
      } else if (child.placement.positioning === 'free') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, index, 'children'],
          message: `Free placement is invalid in auto layout for ${child.id}`,
        })
      } else if (
        child.placement.positioning === 'absolute' &&
        (child.sizing.width.mode === 'fill' || child.sizing.height.mode === 'fill')
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, index, 'children'],
          message: `Fill sizing is invalid for absolute positioning on ${child.id}`,
        })
      }
    }
  }
  return elements
}

const EVENT_PAYLOADS: Partial<
  Record<UIElement['type'], Partial<Record<string, UIEventDefinition['payload']>>>
> = {
  frame: { focus: 'none', blur: 'none' },
  button: { activate: 'none' },
  'text-input': {
    input: 'string',
    change: 'string',
    submit: 'string',
    focus: 'none',
    blur: 'none',
  },
  'text-area': { input: 'string', change: 'string', focus: 'none', blur: 'none' },
  checkbox: { change: 'boolean' },
  radio: { change: 'string' },
  switch: { change: 'boolean' },
  select: { change: 'string' },
  slider: { input: 'number', change: 'number' },
}

function validateEventBindings(
  type: UIElement['type'],
  bindings: Record<string, UIEventId | undefined>,
  path: (string | number)[],
  events: Map<UIEventId, UIEventDefinition>,
  context: z.RefinementCtx,
): void {
  for (const [slot, binding] of Object.entries(bindings)) {
    if (!binding) continue
    const expectedPayload = EVENT_PAYLOADS[type]?.[slot]
    const definition = events.get(binding)
    if (expectedPayload === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, slot],
        message: `UI event slot ${type}.${slot} is invalid`,
      })
    } else if (!definition) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, slot],
        message: `Unknown UI event: ${binding}`,
      })
    } else if (expectedPayload !== definition.payload) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, slot],
        message: `UI event ${binding} has incompatible payload for ${type}.${slot}`,
      })
    }
  }
}

function validateElementSemantics(
  element: UIElement,
  indexPath: (string | number)[],
  events: Map<UIEventId, UIEventDefinition>,
  context: z.RefinementCtx,
): void {
  const bindings = element.events as Record<string, UIEventId | undefined>
  validateEventBindings(element.type, bindings, [...indexPath, 'events'], events, context)

  if (element.type === 'image') {
    if (element.decorative ? element.alt !== '' : element.alt.trim() === '') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...indexPath, 'alt'],
        message: 'UI image requires meaningful alt text unless decorative',
      })
    }
  }
  if (
    ['text-input', 'text-area', 'select', 'slider', 'progress'].includes(element.type) &&
    !element.accessibility.label
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...indexPath, 'accessibility', 'label'],
      message: `Interactive UI element ${element.id} requires an accessible label`,
    })
  }
  if (element.type === 'slider') {
    if (element.min >= element.max || element.value < element.min || element.value > element.max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: indexPath,
        message: `Invalid slider range/value for ${element.id}`,
      })
    }
    const steps = (element.value - element.min) / element.step
    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...indexPath, 'value'],
        message: `Slider value does not align to step for ${element.id}`,
      })
    }
  }
  if (
    element.type === 'progress' &&
    (element.min >= element.max ||
      (element.value !== null && (element.value < element.min || element.value > element.max)))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: indexPath,
      message: `Invalid progress range/value for ${element.id}`,
    })
  }
  if (element.type === 'select') {
    const options = new Set<string>()
    for (const [optionIndex, option] of element.options.entries()) {
      if (options.has(option.value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...indexPath, 'options', optionIndex, 'value'],
          message: `Duplicate select option value: ${option.value}`,
        })
      }
      options.add(option.value)
    }
    if (element.value !== null && !options.has(element.value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...indexPath, 'value'],
        message: `Unknown initial select value: ${element.value}`,
      })
    }
  }
}

function validateOverrideValue(
  source: UIElement,
  value: string | number | boolean | null,
  sourceElements: readonly UIElement[],
  path: (string | number)[],
  context: z.RefinementCtx,
): void {
  let valid = false
  if (source.type === 'text-input' || source.type === 'text-area') {
    valid =
      typeof value === 'string' &&
      (source.maxLength === undefined || value.length <= source.maxLength)
  } else if (source.type === 'checkbox' || source.type === 'switch') {
    valid = typeof value === 'boolean'
  } else if (source.type === 'radio') {
    valid =
      value === null ||
      (typeof value === 'string' &&
        sourceElements.some(
          (candidate) =>
            candidate.type === 'radio' &&
            candidate.group === source.group &&
            candidate.optionValue === value,
        ))
  } else if (source.type === 'select') {
    valid =
      value === null ||
      (typeof value === 'string' && source.options.some((option) => option.value === value))
  } else if (source.type === 'slider') {
    valid =
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= source.min &&
      value <= source.max &&
      Math.abs(
        (value - source.min) / source.step - Math.round((value - source.min) / source.step),
      ) < 1e-9
  } else if (source.type === 'progress') {
    valid =
      value === null ||
      (typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= source.min &&
        value <= source.max)
  }
  if (!valid)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `Value override is invalid for ${source.type}`,
    })
}

function validateRadioGroups(
  input: readonly UIElement[],
  path: (string | number)[],
  context: z.RefinementCtx,
): void {
  const groups = new Map<string, { options: Set<string>; initial: string | null | undefined }>()
  for (const [index, element] of input.entries()) {
    if (element.type !== 'radio') continue
    const group = groups.get(element.group) ?? { options: new Set(), initial: undefined }
    if (group.options.has(element.optionValue)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index, 'optionValue'],
        message: `Duplicate radio option ${element.optionValue} in group ${element.group}`,
      })
    }
    group.options.add(element.optionValue)
    if (group.initial !== undefined && group.initial !== element.value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index, 'value'],
        message: `Inconsistent initial value for radio group ${element.group}`,
      })
    }
    group.initial = element.value
    groups.set(element.group, group)
  }
  for (const [name, group] of groups) {
    if (
      group.initial !== null &&
      group.initial !== undefined &&
      !group.options.has(group.initial)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `Unknown initial radio value ${group.initial} in group ${name}`,
      })
    }
  }
}

export const UIDocumentSchema: z.ZodType<UIDocument, z.ZodTypeDef, unknown> =
  UIDocumentObjectSchema.superRefine((value, context) => {
    const eventMap = new Map<UIEventId, UIEventDefinition>()
    for (const [index, event] of value.events.entries()) {
      if (eventMap.has(event.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['events', index, 'id'],
          message: `Duplicate UI event ID: ${event.id}`,
        })
      }
      eventMap.set(event.id, event)
    }
    const componentMap = new Map<UIComponentId, UIComponentDefinition>()
    const allElementIds = new Set<UIElementId>()
    for (const [index, component] of value.components.entries()) {
      if (componentMap.has(component.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['components', index, 'id'],
          message: `Duplicate UI component ID: ${component.id}`,
        })
      }
      componentMap.set(component.id, component)
    }

    const documentElements = validateTree(value.root, value.elements, ['elements'], context, true)
    const root = documentElements.get(value.root)
    if (
      root?.sizing.width.mode === 'fill' ||
      root?.sizing.height.mode === 'fill' ||
      (root?.sizing.width.mode === 'fixed' && root.sizing.width.unit === '%') ||
      (root?.sizing.height.mode === 'fixed' && root.sizing.height.unit === '%')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['elements', 0, 'sizing'],
        message: 'UI root requires host-independent sizing',
      })
    }
    const scopes: Array<{ elements: readonly UIElement[]; path: (string | number)[] }> = [
      { elements: value.elements, path: ['elements'] },
    ]
    for (const [componentIndex, component] of value.components.entries()) {
      validateTree(
        component.root,
        component.elements,
        ['components', componentIndex, 'elements'],
        context,
        false,
      )
      scopes.push({
        elements: component.elements,
        path: ['components', componentIndex, 'elements'],
      })
    }
    for (const scope of scopes) {
      for (const [index, element] of scope.elements.entries()) {
        if (allElementIds.has(element.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...scope.path, index, 'id'],
            message: `Duplicate global UI element ID: ${element.id}`,
          })
        }
        allElementIds.add(element.id)
        validateElementSemantics(element, [...scope.path, index], eventMap, context)
        if (element.type === 'instance') {
          const component = componentMap.get(element.component)
          if (!component) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...scope.path, index, 'component'],
              message: `Unknown UI component: ${element.component}`,
            })
          } else {
            const sourceIds = new Map(component.elements.map((source) => [source.id, source]))
            for (const [sourceId, override] of Object.entries(element.overrides)) {
              if (!override) continue
              const source = sourceIds.get(sourceId as UIElementId)
              if (!source) {
                context.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: [...scope.path, index, 'overrides', sourceId],
                  message: `Unknown overridden UI element: ${sourceId}`,
                })
                continue
              }
              if (
                override.text !== undefined &&
                source.type !== 'text' &&
                source.type !== 'button'
              ) {
                context.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: [...scope.path, index, 'overrides', sourceId, 'text'],
                  message: `Text override is invalid for ${source.type}`,
                })
              }
              if (override.value !== undefined && !VALUE_TYPES.has(source.type)) {
                context.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: [...scope.path, index, 'overrides', sourceId, 'value'],
                  message: `Value override is invalid for ${source.type}`,
                })
              } else if (override.value !== undefined) {
                validateOverrideValue(
                  source,
                  override.value,
                  component.elements,
                  [...scope.path, index, 'overrides', sourceId, 'value'],
                  context,
                )
              }
              if (override.events) {
                validateEventBindings(
                  source.type,
                  override.events,
                  [...scope.path, index, 'overrides', sourceId, 'events'],
                  eventMap,
                  context,
                )
              }
            }
            const effectiveElements = component.elements.map((source) => {
              const override = element.overrides[source.id]
              return override?.value !== undefined
                ? ({ ...source, value: override.value } as UIElement)
                : source
            })
            validateRadioGroups(effectiveElements, [...scope.path, index, 'overrides'], context)
          }
        }
      }
      validateRadioGroups(scope.elements, scope.path, context)
    }

    const visiting = new Set<UIComponentId>()
    const visited = new Set<UIComponentId>()
    const visitComponent = (componentId: UIComponentId): void => {
      if (visiting.has(componentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['components'],
          message: `UI component instance cycle at ${componentId}`,
        })
        return
      }
      if (visited.has(componentId)) return
      visiting.add(componentId)
      const component = componentMap.get(componentId)
      if (component) {
        for (const element of component.elements)
          if (element.type === 'instance') visitComponent(element.component)
      }
      visiting.delete(componentId)
      visited.add(componentId)
    }
    for (const componentId of componentMap.keys()) visitComponent(componentId)

    const themeIds = new Set<UIThemeId>()
    for (const [themeIndex, theme] of value.themes.entries()) {
      if (themeIds.has(theme.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['themes', themeIndex, 'id'],
          message: `Duplicate UI theme ID: ${theme.id}`,
        })
      }
      themeIds.add(theme.id)
      for (const elementId of Object.keys(theme.styles)) {
        if (!allElementIds.has(elementId as UIElementId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['themes', themeIndex, 'styles', elementId],
            message: `Unknown themed UI element: ${elementId}`,
          })
        }
      }
    }
    if (value.defaultTheme && !themeIds.has(value.defaultTheme)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultTheme'],
        message: `Unknown UI theme: ${value.defaultTheme}`,
      })
    }
  }) as unknown as z.ZodType<UIDocument, z.ZodTypeDef, unknown>

export interface UIElementRef {
  readonly document: AssetRef<typeof UI_DOCUMENT_ASSET_TYPE>
  readonly element: UIElementId
}

export const UIElementRefSchema = z
  .object({ document: AssetRefSchema, element: UIElementIdSchema })
  .strict() as unknown as z.ZodType<UIElementRef>

export const UI_DOCUMENT_ASSET_DESCRIPTOR = {
  type: UI_DOCUMENT_ASSET_TYPE,
  name: 'UI Document',
  schema: UIDocumentSchema,
  dependencies: (value) => collectAssetReferences(value),
} satisfies AssetTypeDescriptor<UIDocument>

export function registerUIAssetTypes(registry: {
  register<T>(descriptor: AssetTypeDescriptor<T>): void
}): void {
  registry.register(UI_DOCUMENT_ASSET_DESCRIPTOR)
}

export function uiElementRef(document: AssetId, element: UIElementId): UIElementRef {
  return { document: { $ref: document, type: UI_DOCUMENT_ASSET_TYPE }, element }
}

export function isTextureReference(reference: AssetRef): boolean {
  return reference.type === undefined || reference.type === TEXTURE_ASSET_TYPE
}
