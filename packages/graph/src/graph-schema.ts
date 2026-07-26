import { z } from 'zod'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
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
  z
    .object({
      type: DataTypeIdSchema,
      arguments: z.array(TypeExpressionSchema).default([]),
    })
    .strict(),
)

export interface TypeExpression {
  readonly type: string
  readonly arguments: readonly TypeExpression[]
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

export const GraphAssetSchema = z
  .object({
    schemaVersion: z.literal(1),
    graph: GraphDocumentSchema,
  })
  .strict()

export type GraphPortKind = z.infer<typeof GraphPortKindSchema>
export type GraphPortDirection = z.infer<typeof GraphPortDirectionSchema>
export type GraphCallsite = z.infer<typeof GraphCallsiteSchema>
export type GraphNode = z.infer<typeof GraphNodeSchema>
export type GraphConnection = z.infer<typeof GraphConnectionSchema>
export type GraphPublicPort = z.infer<typeof GraphPublicPortSchema>
export type GraphPublicInterface = z.infer<typeof GraphPublicInterfaceSchema>
export type GraphDocument = z.infer<typeof GraphDocumentSchema>
export type GraphAsset = z.infer<typeof GraphAssetSchema>
