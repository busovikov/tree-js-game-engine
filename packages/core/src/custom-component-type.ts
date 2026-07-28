import { z } from 'zod'
import {
  AssetRefSchema,
  ComponentTypeIdSchema,
  CustomComponentTypeAssetSchema,
  EntityRefSchema,
  assetTypeId,
  type CustomComponentField,
  type CustomComponentTypeAsset,
  type ParsedCustomComponentTypeAsset,
} from '@haku/schema'
import type { ComponentDefinition } from './types.js'

export { CustomComponentTypeAssetSchema, type CustomComponentTypeAsset }

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`)
    .join(',')}}`
}

function componentFingerprint(asset: ParsedCustomComponentTypeAsset): string {
  const canonical = canonicalStringify(asset)
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `haku-component-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function schemaForField(field: CustomComponentField): z.ZodTypeAny {
  if (field.type === 'number') {
    let schema = z.number().finite()
    if (field.inspector?.min !== undefined) schema = schema.min(field.inspector.min)
    if (field.inspector?.max !== undefined) schema = schema.max(field.inspector.max)
    return schema.default(field.default)
  }
  if (field.type === 'string') return z.string().default(field.default)
  if (field.type === 'boolean') return z.boolean().default(field.default)
  if (field.type === 'vec2' || field.type === 'vec3' || field.type === 'color') {
    if (field.type === 'vec2') {
      return z
        .tuple([z.number().finite(), z.number().finite()])
        .default(field.default as [number, number])
    }
    if (field.type === 'vec3') {
      return z
        .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
        .default(field.default as [number, number, number])
    }
    return z
      .tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
      .default(field.default as [number, number, number, number])
  }

  let referenceSchema: z.ZodTypeAny
  if (field.type === 'entity-ref') {
    referenceSchema = EntityRefSchema
  } else if (field.type === 'asset-ref') {
    referenceSchema = AssetRefSchema.refine(
      (value) => value.type === undefined || value.type === field.assetType,
      `Asset reference must have type ${field.assetType}`,
    )
  } else {
    referenceSchema = z
      .object({
        entity: EntityRefSchema,
        component: ComponentTypeIdSchema,
      })
      .strict()
      .refine(
        (value) => field.componentType === undefined || value.component === field.componentType,
        field.componentType === undefined
          ? 'Invalid component reference'
          : `Component reference must have type ${field.componentType}`,
      )
  }
  if (field.optional) return referenceSchema.nullable().default(field.default ?? null)
  return referenceSchema.default(field.default)
}

export function createCustomComponentDefinition(
  input: CustomComponentTypeAsset,
): ComponentDefinition {
  const asset = CustomComponentTypeAssetSchema.parse(input)
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of asset.fields) {
    shape[field.name] = schemaForField(field)
  }
  const schema = z.object(shape).strict()

  return {
    id: asset.id,
    name: asset.name,
    version: asset.version,
    fingerprint: componentFingerprint(asset),
    references: asset.fields
      .filter(
        (field): field is Extract<CustomComponentField, { type: 'asset-ref' }> =>
          field.type === 'asset-ref',
      )
      .map((field) => ({
        path: field.name,
        assetType: assetTypeId(field.assetType),
        optional: field.optional,
      })),
    inspector: {
      ...(asset.inspector.category === undefined ? {} : { category: asset.inspector.category }),
      ...(asset.inspector.description === undefined
        ? {}
        : { description: asset.inspector.description }),
      fields: asset.fields.map((field) => ({
        name: field.name,
        type: field.type,
        label: field.inspector?.label ?? field.name,
        optional: 'optional' in field ? field.optional : false,
        ...(field.type === 'number' && field.inspector?.min !== undefined
          ? { min: field.inspector.min }
          : {}),
        ...(field.type === 'number' && field.inspector?.max !== undefined
          ? { max: field.inspector.max }
          : {}),
        ...(field.type === 'number' && field.inspector?.step !== undefined
          ? { step: field.inspector.step }
          : {}),
        ...(field.type === 'string' && field.inspector?.placeholder !== undefined
          ? { placeholder: field.inspector.placeholder }
          : {}),
        ...(field.type === 'string' && field.inspector?.multiline !== undefined
          ? { multiline: field.inspector.multiline }
          : {}),
      })),
    },
    ...(!asset.behaviorGraph && !asset.typescriptBehavior
      ? {}
      : {
          behavior: {
            ...(asset.behaviorGraph ? { graph: AssetRefSchema.parse(asset.behaviorGraph) } : {}),
            ...(asset.typescriptBehavior
              ? {
                  typescript: {
                    ...asset.typescriptBehavior,
                    query: [...asset.typescriptBehavior.query],
                    reads: [...asset.typescriptBehavior.reads],
                    writes: [...asset.typescriptBehavior.writes],
                    effects: [...asset.typescriptBehavior.effects],
                    commands: [...asset.typescriptBehavior.commands],
                  },
                }
              : {}),
          },
        }),
    ...(asset.editorExtension ? { editorExtension: { ...asset.editorExtension } } : {}),
    schema,
    defaults: () => schema.parse({}),
  }
}
