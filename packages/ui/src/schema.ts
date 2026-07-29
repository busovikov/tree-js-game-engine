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

export const UIElementIdSchema = z
  .string()
  .uuid()
  .transform((value) => value as UIElementId)

export const UILengthSchema = z.union([
  z.number().nonnegative(),
  z.string().regex(/^(?:\d+(?:\.\d+)?%|auto)$/),
])
export type UILength = z.infer<typeof UILengthSchema>

export const UILayoutSchema = z
  .object({
    direction: z.enum(['row', 'column']).default('column'),
    wrap: z.boolean().default(false),
    justify: z
      .enum(['start', 'center', 'end', 'space-between', 'space-around'])
      .default('start'),
    align: z.enum(['start', 'center', 'end', 'stretch']).default('stretch'),
    gap: z.number().nonnegative().default(0),
  })
  .strict()
export type UILayout = z.infer<typeof UILayoutSchema>

export const UISizingSchema = z
  .object({
    width: UILengthSchema.optional(),
    height: UILengthSchema.optional(),
    minWidth: UILengthSchema.optional(),
    minHeight: UILengthSchema.optional(),
    maxWidth: UILengthSchema.optional(),
    maxHeight: UILengthSchema.optional(),
    grow: z.number().nonnegative().optional(),
    shrink: z.number().nonnegative().optional(),
    basis: UILengthSchema.optional(),
  })
  .strict()
export type UISizing = z.infer<typeof UISizingSchema>

export const UIAnchorsSchema = z
  .object({
    left: UILengthSchema.optional(),
    right: UILengthSchema.optional(),
    top: UILengthSchema.optional(),
    bottom: UILengthSchema.optional(),
  })
  .strict()
export type UIAnchors = z.infer<typeof UIAnchorsSchema>

export const UIStyleSchema = z
  .object({
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    fontFamily: z.string().optional(),
    fontSize: z.number().positive().optional(),
    fontWeight: z.union([z.number().int().min(1).max(1000), z.enum(['normal', 'bold'])]).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    padding: z.number().nonnegative().optional(),
    margin: z.number().optional(),
    borderColor: z.string().optional(),
    borderWidth: z.number().nonnegative().optional(),
    borderRadius: z.number().nonnegative().optional(),
    opacity: z.number().min(0).max(1).optional(),
    cursor: z.enum(['auto', 'default', 'pointer', 'not-allowed']).optional(),
    objectFit: z.enum(['contain', 'cover', 'fill', 'none', 'scale-down']).optional(),
  })
  .strict()
export type UIStyle = z.infer<typeof UIStyleSchema>

export const UIAccessibilitySchema = z
  .object({
    label: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    role: z
      .enum(['application', 'banner', 'complementary', 'contentinfo', 'group', 'main', 'region', 'status'])
      .optional(),
    live: z.enum(['off', 'polite', 'assertive']).optional(),
  })
  .strict()
export type UIAccessibility = z.infer<typeof UIAccessibilitySchema>

const UIElementBaseSchema = z.object({
  id: UIElementIdSchema,
  name: z.string().min(1).optional(),
  visible: z.boolean().default(true),
  enabled: z.boolean().default(true),
  sizing: UISizingSchema.default({}),
  anchors: UIAnchorsSchema.default({}),
  style: UIStyleSchema.default({}),
  accessibility: UIAccessibilitySchema.default({}),
})

export const UIContainerElementSchema = UIElementBaseSchema.extend({
  type: z.literal('container'),
  children: z.array(UIElementIdSchema).default([]),
  layout: UILayoutSchema.default({}),
}).strict()

export const UITextElementSchema = UIElementBaseSchema.extend({
  type: z.literal('text'),
  text: z.string().default(''),
}).strict()

export const UIButtonElementSchema = UIElementBaseSchema.extend({
  type: z.literal('button'),
  text: z.string().default('Button'),
  activateEvent: UIElementIdSchema.optional(),
}).strict()

export const UIImageElementSchema = UIElementBaseSchema.extend({
  type: z.literal('image'),
  source: AssetRefSchema,
  alt: z.string().default(''),
}).strict()

export const UIElementSchema = z.discriminatedUnion('type', [
  UIContainerElementSchema,
  UITextElementSchema,
  UIButtonElementSchema,
  UIImageElementSchema,
])
export type UIElement = z.infer<typeof UIElementSchema>

export const UIEventDefinitionSchema = z
  .object({
    id: UIElementIdSchema,
    name: z.string().min(1),
    payload: z.enum(['none', 'string', 'number', 'boolean']).default('none'),
  })
  .strict()
export type UIEventDefinition = z.infer<typeof UIEventDefinitionSchema>

export const UIThemeSchema = z
  .object({
    id: UIElementIdSchema,
    name: z.string().min(1),
    styles: z.record(UIElementIdSchema, UIStyleSchema).default({}),
  })
  .strict()
export type UITheme = z.infer<typeof UIThemeSchema>

const UIDocumentObjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: AssetIdSchema,
    name: z.string().min(1),
    root: UIElementIdSchema,
    elements: z.array(UIElementSchema).min(1),
    events: z.array(UIEventDefinitionSchema).default([]),
    themes: z.array(UIThemeSchema).default([]),
    defaultTheme: UIElementIdSchema.optional(),
  })
  .strict()

export interface UIDocument {
  readonly schemaVersion: 1
  readonly id: AssetId
  readonly name: string
  readonly root: UIElementId
  readonly elements: UIElement[]
  readonly events: UIEventDefinition[]
  readonly themes: UITheme[]
  readonly defaultTheme?: UIElementId
}

export const UIDocumentSchema: z.ZodType<UIDocument, z.ZodTypeDef, unknown> =
  UIDocumentObjectSchema.superRefine((value, context) => {
  const elements = new Map<UIElementId, UIElement>()
  for (const [index, element] of value.elements.entries()) {
    if (elements.has(element.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['elements', index, 'id'],
        message: `Duplicate UI element ID: ${element.id}`,
      })
    }
    elements.set(element.id, element)
  }
  const root = elements.get(value.root)
  if (!root || root.type !== 'container') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['root'],
      message: 'UI root must reference a container element',
    })
    return
  }

  const parents = new Map<UIElementId, UIElementId>()
  for (const [index, element] of value.elements.entries()) {
    if (element.type !== 'container') continue
    for (const [childIndex, child] of element.children.entries()) {
      if (!elements.has(child)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['elements', index, 'children', childIndex],
          message: `Unknown UI child: ${child}`,
        })
      }
      const previous = parents.get(child)
      if (previous) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['elements', index, 'children', childIndex],
          message: `UI element ${child} already has parent ${previous}`,
        })
      }
      parents.set(child, element.id)
    }
  }
  if (parents.has(value.root)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['root'],
      message: 'UI root cannot have a parent',
    })
  }

  const visited = new Set<UIElementId>()
  const visiting = new Set<UIElementId>()
  const visit = (id: UIElementId): void => {
    if (visiting.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['elements'],
        message: `UI hierarchy cycle at ${id}`,
      })
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    const element = elements.get(id)
    if (element?.type === 'container') {
      for (const child of element.children) visit(child)
    }
    visiting.delete(id)
    visited.add(id)
  }
  visit(value.root)
  for (const [index, element] of value.elements.entries()) {
    if (!visited.has(element.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['elements', index],
        message: `UI element ${element.id} is unreachable from root`,
      })
    }
  }

  const eventIds = new Set(value.events.map((event) => event.id))
  for (const [index, element] of value.elements.entries()) {
    if (element.type === 'button' && element.activateEvent && !eventIds.has(element.activateEvent)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['elements', index, 'activateEvent'],
        message: `Unknown UI event: ${element.activateEvent}`,
      })
    }
  }
  const themeIds = new Set(value.themes.map((theme) => theme.id))
  if (value.defaultTheme && !themeIds.has(value.defaultTheme)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['defaultTheme'],
      message: `Unknown UI theme: ${value.defaultTheme}`,
    })
  }
  for (const [themeIndex, theme] of value.themes.entries()) {
    for (const elementId of Object.keys(theme.styles)) {
      if (!elements.has(elementId as UIElementId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['themes', themeIndex, 'styles', elementId],
          message: `Unknown themed UI element: ${elementId}`,
        })
      }
    }
  }
  }) as unknown as z.ZodType<UIDocument, z.ZodTypeDef, unknown>

export interface UIElementRef {
  readonly document: AssetRef<typeof UI_DOCUMENT_ASSET_TYPE>
  readonly element: UIElementId
}

export const UIElementRefSchema = z
  .object({
    document: AssetRefSchema,
    element: UIElementIdSchema,
  })
  .strict() as unknown as z.ZodType<UIElementRef>

export const UI_DOCUMENT_ASSET_DESCRIPTOR = {
  type: UI_DOCUMENT_ASSET_TYPE,
  name: 'UI Document',
  schema: UIDocumentSchema,
  dependencies: (value) => collectAssetReferences(value),
} satisfies AssetTypeDescriptor<UIDocument>

export function registerUIAssetTypes(registry: { register<T>(descriptor: AssetTypeDescriptor<T>): void }): void {
  registry.register(UI_DOCUMENT_ASSET_DESCRIPTOR)
}

export function uiElementRef(document: AssetId, element: UIElementId): UIElementRef {
  return {
    document: { $ref: document, type: UI_DOCUMENT_ASSET_TYPE },
    element,
  }
}

export function isTextureReference(reference: AssetRef): boolean {
  return reference.type === undefined || reference.type === TEXTURE_ASSET_TYPE
}
