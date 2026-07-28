import { z } from 'zod'
import { ComponentTypeIdSchema } from '@haku/schema'
import type { ComponentDefinition } from './types.js'

const CustomComponentNumberFieldSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    type: z.literal('number'),
    default: z.number().finite(),
  })
  .strict()

export const CustomComponentTypeAssetSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: ComponentTypeIdSchema,
    name: z.string().min(1),
    version: z.number().int().positive(),
    fields: z.array(CustomComponentNumberFieldSchema),
  })
  .strict()

export type CustomComponentTypeAsset = z.input<
  typeof CustomComponentTypeAssetSchema
>

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`)
    .join(',')}}`
}

function componentFingerprint(asset: z.output<typeof CustomComponentTypeAssetSchema>): string {
  const canonical = canonicalStringify(asset)
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `haku-component-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function createCustomComponentDefinition(
  input: CustomComponentTypeAsset,
): ComponentDefinition<Record<string, number>> {
  const asset = CustomComponentTypeAssetSchema.parse(input)
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of asset.fields) {
    shape[field.name] = z.number().finite().default(field.default)
  }
  const schema = z.object(shape).strict()

  return {
    id: asset.id,
    name: asset.name,
    version: asset.version,
    fingerprint: componentFingerprint(asset),
    schema,
    defaults: () => schema.parse({}),
  }
}
