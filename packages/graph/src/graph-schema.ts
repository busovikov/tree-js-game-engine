import { z } from 'zod'
import { SCHEDULER_PHASES } from '@haku/core'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
)

export const GraphIdSchema = z.string().uuid()
export const GraphNodeIdSchema = z.string().uuid()
export const GraphPortIdSchema = z.string().uuid()
export const GraphCallsiteIdSchema = z.string().uuid()
export const GraphConnectionIdSchema = z.string().uuid()
export const NodeTypeIdSchema = z.string().uuid()
export const DataTypeIdSchema = z.string().uuid()

export const TypeExpressionSchema: z.ZodType<TypeExpression, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('named'),
        type: DataTypeIdSchema,
        arguments: z.array(TypeExpressionSchema).default([]),
      })
      .strict(),
    z
      .object({
        kind: z.literal('generic'),
        name: z.string().regex(/^[A-Z][A-Za-z0-9_]*$/),
      })
      .strict(),
  ]),
)

export type TypeExpression =
  | {
      readonly kind: 'named'
      readonly type: string
      readonly arguments: readonly TypeExpression[]
    }
  | {
      readonly kind: 'generic'
      readonly name: string
    }

export function namedType(
  type: string,
  arguments_: readonly TypeExpression[] = [],
): TypeExpression {
  return TypeExpressionSchema.parse({
    kind: 'named',
    type,
    arguments: arguments_,
  })
}

export function genericType(name: string): TypeExpression {
  return TypeExpressionSchema.parse({ kind: 'generic', name })
}

export const GraphPortKindSchema = z.enum(['flow', 'event', 'trigger', 'data'])
export const GraphPortDirectionSchema = z.enum(['input', 'output'])

const GraphCallsiteBaseSchema = z
    .object({
      id: GraphCallsiteIdSchema,
      port: GraphPortIdSchema,
      direction: GraphPortDirectionSchema,
    })
    .strict()

export const GraphCallsiteSchema = z.union([
  GraphCallsiteBaseSchema.extend({
    kind: z.enum(['event', 'data']),
    type: TypeExpressionSchema,
  }),
  GraphCallsiteBaseSchema.extend({
    kind: z.enum(['flow', 'trigger']),
  }),
])

export const GraphNodeLayoutSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive().finite().optional(),
    height: z.number().positive().finite().optional(),
    collapsed: z.boolean().optional(),
    label: z.string().optional(),
  })
  .strict()

export const GraphNodeSchema = z
  .object({
    id: GraphNodeIdSchema,
    type: NodeTypeIdSchema,
    version: z.string().min(1),
    callsites: z.array(GraphCallsiteSchema),
    properties: z.record(JsonValueSchema),
    layout: GraphNodeLayoutSchema,
    domain: z.enum(SCHEDULER_PHASES).optional(),
  })
  .strict()

export const GraphConnectionEndpointSchema = z
  .object({
    node: GraphNodeIdSchema,
    callsite: GraphCallsiteIdSchema,
  })
  .strict()

export const GraphConnectionSchema = z
  .object({
    id: GraphConnectionIdSchema,
    from: GraphConnectionEndpointSchema,
    to: GraphConnectionEndpointSchema,
  })
  .strict()

const GraphPublicPortBaseSchema = z
    .object({
      id: GraphPortIdSchema,
      name: z.string().min(1),
      direction: GraphPortDirectionSchema,
    })
    .strict()

export const GraphPublicPortSchema = z.union([
  GraphPublicPortBaseSchema.extend({
    kind: z.enum(['event', 'data']),
    type: TypeExpressionSchema,
  }),
  GraphPublicPortBaseSchema.extend({
    kind: z.enum(['flow', 'trigger']),
  }),
])

export const GraphPublicInterfaceSchema = z
  .object({
    ports: z.array(GraphPublicPortSchema),
  })
  .strict()

export const GraphDocumentSchema = z
  .object({
    id: GraphIdSchema,
    name: z.string().min(1),
    nodes: z.array(GraphNodeSchema),
    connections: z.array(GraphConnectionSchema),
    publicInterface: GraphPublicInterfaceSchema,
    metadata: z.record(JsonValueSchema),
  })
  .strict()

const GraphAssetDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    graph: GraphDocumentSchema,
  })
  .strict()

const UI_LIBRARY_FIELDS = new Set([
  'reactFlow',
  'positionAbsolute',
  'handleBounds',
  'selected',
  'dragging',
  'measured',
  'sourcePosition',
  'targetPosition',
])

function findUiLibraryField(
  value: unknown,
  path: (string | number)[] = [],
): { readonly field: string; readonly path: (string | number)[] } | undefined {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findUiLibraryField(item, [...path, index])
      if (found) return found
    }
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  for (const [key, item] of Object.entries(value)) {
    if (UI_LIBRARY_FIELDS.has(key)) {
      return { field: key, path: [...path, key] }
    }
    const found = findUiLibraryField(item, [...path, key])
    if (found) return found
  }
  return undefined
}

export const GraphAssetSchema = GraphAssetDataSchema.superRefine((value, context) => {
  const found = findUiLibraryField(value)
  if (!found) return
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: `UI-library field is not valid graph data: ${found.field}`,
    path: found.path,
  })
})

export type GraphPortKind = z.infer<typeof GraphPortKindSchema>
export type GraphPortDirection = z.infer<typeof GraphPortDirectionSchema>
export type GraphCallsite = z.infer<typeof GraphCallsiteSchema>
export type GraphNode = z.infer<typeof GraphNodeSchema>
export type GraphConnection = z.infer<typeof GraphConnectionSchema>
export type GraphConnectionEndpoint = z.infer<typeof GraphConnectionEndpointSchema>
export type GraphPublicPort = z.infer<typeof GraphPublicPortSchema>
export type GraphPublicInterface = z.infer<typeof GraphPublicInterfaceSchema>
export type GraphDocument = z.infer<typeof GraphDocumentSchema>
export type GraphAsset = z.infer<typeof GraphAssetSchema>
