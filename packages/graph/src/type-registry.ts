import { z } from 'zod'
import {
  DataTypeIdSchema,
  JsonValueSchema,
  TypeExpressionSchema,
  type JsonValue,
  type TypeExpression,
} from './graph-schema.js'

export const BOOL_TYPE = '41000000-0000-4000-8000-000000000001'
export const NUMBER_TYPE = '41000000-0000-4000-8000-000000000002'
export const STRING_TYPE = '41000000-0000-4000-8000-000000000003'
export const VEC2_TYPE = '41000000-0000-4000-8000-000000000004'
export const VEC3_TYPE = '41000000-0000-4000-8000-000000000005'
export const QUAT_TYPE = '41000000-0000-4000-8000-000000000006'
export const COLOR_TYPE = '41000000-0000-4000-8000-000000000007'
export const ENTITY_REF_TYPE = '41000000-0000-4000-8000-000000000008'
export const COMPONENT_REF_TYPE = '41000000-0000-4000-8000-000000000009'
export const ASSET_REF_TYPE = '41000000-0000-4000-8000-000000000010'
export const SCENE_REF_TYPE = '41000000-0000-4000-8000-000000000011'
export const GRAPH_REF_TYPE = '41000000-0000-4000-8000-000000000012'
export const POOL_HANDLE_TYPE = '41000000-0000-4000-8000-000000000013'
export const NODE_REF_TYPE = '41000000-0000-4000-8000-000000000014'
export const ARRAY_TYPE = '41000000-0000-4000-8000-000000000015'
export const MAP_TYPE = '41000000-0000-4000-8000-000000000016'
export const OPTION_TYPE = '41000000-0000-4000-8000-000000000017'
export const RESULT_TYPE = '41000000-0000-4000-8000-000000000018'

const VisualStructShapeSchema = z
  .object({
    kind: z.literal('struct'),
    fields: z.array(
      z
        .object({
          name: z.string().min(1),
          type: TypeExpressionSchema,
        })
        .strict(),
    ),
  })
  .strict()

const VisualEnumShapeSchema = z
  .object({
    kind: z.literal('enum'),
    values: z.array(z.string().min(1)).min(1),
  })
  .strict()

const VisualTaggedUnionShapeSchema = z
  .object({
    kind: z.literal('tagged-union'),
    discriminator: z.string().min(1),
    variants: z
      .array(
        z
          .object({
            tag: z.string().min(1),
            fields: z.array(
              z
                .object({
                  name: z.string().min(1),
                  type: TypeExpressionSchema,
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()

const VisualAliasShapeSchema = z
  .object({
    kind: z.literal('alias'),
    target: TypeExpressionSchema,
    constraints: z
      .object({
        min: z.number().finite().optional(),
        max: z.number().finite().optional(),
        pattern: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const VisualDataTypeShapeSchema = z.discriminatedUnion('kind', [
  VisualStructShapeSchema,
  VisualEnumShapeSchema,
  VisualTaggedUnionShapeSchema,
  VisualAliasShapeSchema,
])

export const VisualDataTypeAssetSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: DataTypeIdSchema,
    name: z.string().min(1),
    version: z.string().min(1),
    shape: VisualDataTypeShapeSchema,
    metadata: z
      .object({
        editorWidget: z.string().min(1).optional(),
        serializable: z.boolean().default(true),
        checkpointSafe: z.boolean().default(true),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((asset, context) => {
    const duplicate = (values: readonly string[]): string | undefined => {
      const seen = new Set<string>()
      for (const value of values) {
        if (seen.has(value)) return value
        seen.add(value)
      }
      return undefined
    }
    if (asset.shape.kind === 'enum') {
      const value = duplicate(asset.shape.values)
      if (value) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate enum value: ${value}`,
          path: ['shape', 'values'],
        })
      }
    }
    if (asset.shape.kind === 'struct') {
      const field = duplicate(asset.shape.fields.map((item) => item.name))
      if (field) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate field: ${field}`,
          path: ['shape', 'fields'],
        })
      }
    }
    if (asset.shape.kind === 'tagged-union') {
      const tag = duplicate(asset.shape.variants.map((variant) => variant.tag))
      if (tag) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate variant tag: ${tag}`,
          path: ['shape', 'variants'],
        })
      }
      for (const [index, variant] of asset.shape.variants.entries()) {
        const field = duplicate(variant.fields.map((item) => item.name))
        if (field) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate field: ${field}`,
            path: ['shape', 'variants', index, 'fields'],
          })
        }
      }
    }
    if (
      asset.shape.kind === 'alias' &&
      asset.shape.constraints?.pattern !== undefined
    ) {
      try {
        new RegExp(asset.shape.constraints.pattern)
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Alias pattern must be a valid regular expression',
          path: ['shape', 'constraints', 'pattern'],
        })
      }
    }
  })

export type VisualDataTypeShape = z.infer<typeof VisualDataTypeShapeSchema>
export type VisualDataTypeAsset = z.input<typeof VisualDataTypeAssetSchema>

export interface DataTypeContract {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly typeParameters: readonly string[]
  readonly shape: JsonValue
  readonly serializable: boolean
  readonly checkpointSafe: boolean
  readonly editorWidget?: string
}

export interface DataTypeDefinition {
  readonly contract: DataTypeContract
  readonly runtimeSchema: z.ZodTypeAny
  readonly createRuntimeSchema: (
    arguments_: readonly z.ZodTypeAny[],
  ) => z.ZodTypeAny
}

function projectContract(asset: z.output<typeof VisualDataTypeAssetSchema>): DataTypeContract {
  return {
    id: asset.id,
    name: asset.name,
    version: asset.version,
    typeParameters: [],
    shape: JsonValueSchema.parse(asset.shape),
    serializable: asset.metadata.serializable,
    checkpointSafe: asset.metadata.checkpointSafe,
    ...(asset.metadata.editorWidget === undefined
      ? {}
      : { editorWidget: asset.metadata.editorWidget }),
  }
}

function schemaForFields(
  fields: readonly { readonly name: string; readonly type: TypeExpression }[],
  registry: TypeRegistry,
): z.AnyZodObject {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    if (shape[field.name]) throw new Error(`Duplicate field: ${field.name}`)
    shape[field.name] = resolveTypeExpression(registry, field.type)
  }
  return z.object(shape).strict()
}

function schemaForVisualShape(
  shape: VisualDataTypeShape,
  registry: TypeRegistry,
): z.ZodTypeAny {
  if (shape.kind === 'struct') return schemaForFields(shape.fields, registry)
  if (shape.kind === 'enum') {
    const [first, ...rest] = shape.values
    return z.enum([first, ...rest])
  }
  if (shape.kind === 'tagged-union') {
    const variants = shape.variants.map((variant) =>
      schemaForFields(variant.fields, registry).extend({
        [shape.discriminator]: z.literal(variant.tag),
      }),
    )
    if (variants.length === 1) return variants[0]
    return z.union([
      variants[0],
      variants[1],
      ...variants.slice(2),
    ])
  }
  const base = resolveTypeExpression(registry, shape.target)
  const constraints = shape.constraints
  if (!constraints) return base
  return base.superRefine((value, context) => {
    if (typeof value === 'number') {
      if (constraints.min !== undefined && value < constraints.min) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Value must be >= ${constraints.min}` })
      }
      if (constraints.max !== undefined && value > constraints.max) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Value must be <= ${constraints.max}` })
      }
    }
    if (
      typeof value === 'string' &&
      constraints.pattern !== undefined &&
      !new RegExp(constraints.pattern).test(value)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Value must match ${constraints.pattern}` })
    }
  })
}

export function defineVisualDataType(
  input: VisualDataTypeAsset,
  registry: TypeRegistry,
): DataTypeDefinition {
  const asset = VisualDataTypeAssetSchema.parse(input)
  const runtimeSchema = schemaForVisualShape(asset.shape, registry)
  return {
    contract: projectContract(asset),
    runtimeSchema,
    createRuntimeSchema: (arguments_) => {
      if (arguments_.length > 0) throw new Error(`${asset.name} expects 0 type arguments`)
      return runtimeSchema
    },
  }
}

export function defineSchemaDataType(
  input: VisualDataTypeAsset & { readonly runtimeSchema: z.ZodTypeAny },
): DataTypeDefinition {
  const { runtimeSchema, ...assetInput } = input
  const asset = VisualDataTypeAssetSchema.parse(assetInput)
  return {
    contract: projectContract(asset),
    runtimeSchema,
    createRuntimeSchema: (arguments_) => {
      if (arguments_.length > 0) throw new Error(`${asset.name} expects 0 type arguments`)
      return runtimeSchema
    },
  }
}

export class TypeRegistry {
  private readonly definitions = new Map<string, DataTypeDefinition>()

  register(definition: DataTypeDefinition): void {
    const id = DataTypeIdSchema.parse(definition.contract.id)
    if (this.definitions.has(id)) throw new Error(`Duplicate data type: ${id}`)
    this.definitions.set(id, definition)
  }

  get(id: string): DataTypeDefinition | undefined {
    return this.definitions.get(id)
  }

  require(id: string): DataTypeDefinition {
    const definition = this.get(id)
    if (!definition) throw new Error(`Unknown data type: ${id}`)
    return definition
  }

  all(): readonly DataTypeDefinition[] {
    return [...this.definitions.values()].sort((left, right) =>
      left.contract.id.localeCompare(right.contract.id),
    )
  }

  fingerprint(): string {
    return fingerprintContracts(this.all().map((definition) => definition.contract))
  }
}

function builtin(
  id: string,
  name: string,
  typeParameters: readonly string[],
  runtimeSchema: z.ZodTypeAny,
  createRuntimeSchema: DataTypeDefinition['createRuntimeSchema'] = () => runtimeSchema,
  shape: JsonValue = { kind: 'builtin' },
): DataTypeDefinition {
  return {
    contract: {
      id,
      name,
      version: '1',
      typeParameters,
      shape,
      serializable: true,
      checkpointSafe: true,
    },
    runtimeSchema,
    createRuntimeSchema,
  }
}

function expectArity(
  name: string,
  arguments_: readonly z.ZodTypeAny[],
  arity: number,
): void {
  if (arguments_.length !== arity) {
    throw new Error(`${name} expects ${arity} type argument${arity === 1 ? '' : 's'}`)
  }
}

export function createBuiltinTypeRegistry(): TypeRegistry {
  const registry = new TypeRegistry()
  const uuid = z.string().uuid()
  const entityRef = z.object({ $ref: z.string().regex(/^entity:[0-9a-f-]+$/i) }).strict()
  const assetRef = z.object({ $ref: uuid }).strict()
  const definitions: DataTypeDefinition[] = [
    builtin(BOOL_TYPE, 'bool', [], z.boolean()),
    builtin(NUMBER_TYPE, 'number', [], z.number().finite()),
    builtin(STRING_TYPE, 'string', [], z.string()),
    builtin(VEC2_TYPE, 'vec2', [], z.tuple([z.number(), z.number()])),
    builtin(VEC3_TYPE, 'vec3', [], z.tuple([z.number(), z.number(), z.number()])),
    builtin(QUAT_TYPE, 'quat', [], z.tuple([z.number(), z.number(), z.number(), z.number()])),
    builtin(COLOR_TYPE, 'color', [], z.tuple([z.number(), z.number(), z.number(), z.number()])),
    builtin(ENTITY_REF_TYPE, 'EntityRef', [], entityRef),
    builtin(
      COMPONENT_REF_TYPE,
      'ComponentRef',
      ['T'],
      z.never(),
      (arguments_) => {
        expectArity('ComponentRef', arguments_, 1)
        return z.object({ entity: entityRef, component: uuid }).strict()
      },
    ),
    builtin(
      ASSET_REF_TYPE,
      'AssetRef',
      ['T'],
      z.never(),
      (arguments_) => {
        expectArity('AssetRef', arguments_, 1)
        return assetRef
      },
    ),
    builtin(SCENE_REF_TYPE, 'SceneRef', [], assetRef),
    builtin(GRAPH_REF_TYPE, 'GraphRef', [], assetRef),
    builtin(
      POOL_HANDLE_TYPE,
      'PoolHandle',
      [],
      z.object({ pool: uuid, entity: uuid, generation: z.number().int().nonnegative() }).strict(),
    ),
    builtin(
      NODE_REF_TYPE,
      'NodeRef',
      ['TContract'],
      z.never(),
      (arguments_) => {
        expectArity('NodeRef', arguments_, 1)
        return z.object({ node: uuid }).strict()
      },
    ),
    builtin(
      ARRAY_TYPE,
      'Array',
      ['T'],
      z.never(),
      (arguments_) => {
        expectArity('Array', arguments_, 1)
        return z.array(arguments_[0])
      },
    ),
    builtin(
      MAP_TYPE,
      'Map',
      ['K', 'V'],
      z.never(),
      (arguments_) => {
        expectArity('Map', arguments_, 2)
        return z.array(z.object({ key: arguments_[0], value: arguments_[1] }).strict())
      },
    ),
    builtin(
      OPTION_TYPE,
      'Option',
      ['T'],
      z.never(),
      (arguments_) => {
        expectArity('Option', arguments_, 1)
        return z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('none') }).strict(),
          z.object({ kind: z.literal('some'), value: arguments_[0] }).strict(),
        ])
      },
    ),
    builtin(
      RESULT_TYPE,
      'Result',
      ['T', 'E'],
      z.never(),
      (arguments_) => {
        expectArity('Result', arguments_, 2)
        return z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('ok'), value: arguments_[0] }).strict(),
          z.object({ kind: z.literal('error'), error: arguments_[1] }).strict(),
        ])
      },
    ),
  ]
  for (const definition of definitions) registry.register(definition)
  return registry
}

export function resolveTypeExpression(
  registry: TypeRegistry,
  expression: TypeExpression,
): z.ZodTypeAny {
  if (expression.kind === 'generic') throw new Error(`Unresolved generic: ${expression.name}`)
  const definition = registry.require(expression.type)
  if (expression.arguments.length !== definition.contract.typeParameters.length) {
    expectArity(
      definition.contract.name,
      expression.arguments.map(() => z.unknown()),
      definition.contract.typeParameters.length,
    )
  }
  return definition.createRuntimeSchema(
    expression.arguments.map((argument) => resolveTypeExpression(registry, argument)),
  )
}

function sameType(left: TypeExpression, right: TypeExpression): boolean {
  return canonicalStringify(left) === canonicalStringify(right)
}

export function inferTypeArguments(
  pattern: TypeExpression,
  actual: TypeExpression,
  initial: Readonly<Record<string, TypeExpression>> = {},
): Record<string, TypeExpression> {
  const bindings: Record<string, TypeExpression> = { ...initial }
  const visit = (expected: TypeExpression, received: TypeExpression): void => {
    if (expected.kind === 'generic') {
      const existing = bindings[expected.name]
      if (existing && !sameType(existing, received)) {
        throw new Error(`Generic ${expected.name} has conflicting inference`)
      }
      bindings[expected.name] = received
      return
    }
    if (received.kind !== 'named' || expected.type !== received.type) {
      throw new Error('Incompatible types; explicit conversion is required')
    }
    if (expected.arguments.length !== received.arguments.length) {
      throw new Error('Incompatible generic arity')
    }
    expected.arguments.forEach((argument, index) => visit(argument, received.arguments[index]))
  }
  visit(pattern, actual)
  return bindings
}

export function substituteTypeArguments(
  expression: TypeExpression,
  bindings: Readonly<Record<string, TypeExpression>>,
): TypeExpression {
  if (expression.kind === 'generic') {
    const bound = bindings[expression.name]
    if (!bound) throw new Error(`Unresolved generic: ${expression.name}`)
    return bound
  }
  return {
    ...expression,
    arguments: expression.arguments.map((argument) =>
      substituteTypeArguments(argument, bindings),
    ),
  }
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`)
    .join(',')}}`
}

export function fingerprintContracts(contracts: readonly DataTypeContract[]): string {
  const canonical = canonicalStringify(
    [...contracts].sort((left, right) => left.id.localeCompare(right.id)),
  )
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `haku-registry-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
