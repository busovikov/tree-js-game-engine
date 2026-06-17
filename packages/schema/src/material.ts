import { z } from 'zod'

export const MaterialTypeSchema = z.enum(['standard'])
export type MaterialType = z.infer<typeof MaterialTypeSchema>

export const MATERIAL_TYPES = MaterialTypeSchema.options

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  standard: 'Standard (PBR)',
}

export type MaterialPropertyKind = 'color' | 'number' | 'boolean'

export interface MaterialPropertySpec {
  key: string
  label: string
  kind: MaterialPropertyKind
  default: string | number | boolean
  min?: number
  max?: number
  step?: number
  hint?: string
}

export const StandardMaterialSchema = z.object({
  materialType: z.literal('standard'),
  color: z.string().default('#6699ff'),
  metalness: z.number().min(0).max(1).default(0),
  roughness: z.number().min(0).max(1).default(0.5),
  wireframe: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  transparent: z.boolean().default(false),
})
export type StandardMaterial = z.infer<typeof StandardMaterialSchema>

/** Maps each material type to its Zod schema for editable properties. */
export const MATERIAL_TYPE_SCHEMAS = {
  standard: StandardMaterialSchema,
} as const satisfies Record<MaterialType, z.ZodType>

export const MATERIAL_PROPERTY_SPECS: Record<MaterialType, MaterialPropertySpec[]> = {
  standard: [
    { key: 'color', label: 'Color', kind: 'color', default: '#6699ff', hint: 'Base color of the material.' },
    {
      key: 'metalness',
      label: 'Metalness',
      kind: 'number',
      default: 0,
      min: 0,
      max: 1,
      step: 0.05,
      hint: 'How metallic the surface appears (0–1).',
    },
    {
      key: 'roughness',
      label: 'Roughness',
      kind: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
      hint: 'Surface roughness (0 = mirror, 1 = fully rough).',
    },
    {
      key: 'opacity',
      label: 'Opacity',
      kind: 'number',
      default: 1,
      min: 0,
      max: 1,
      step: 0.05,
      hint: 'Material opacity (0 = transparent, 1 = opaque).',
    },
    {
      key: 'wireframe',
      label: 'Wireframe',
      kind: 'boolean',
      default: false,
      hint: 'Render mesh edges only.',
    },
    {
      key: 'transparent',
      label: 'Transparent',
      kind: 'boolean',
      default: false,
      hint: 'Enable alpha blending for transparency.',
    },
  ],
}

export function defaultMaterialProperties(type: MaterialType): MeshMaterial {
  return MATERIAL_TYPE_SCHEMAS[type].parse({ materialType: type })
}

export const MeshMaterialSchema = z.preprocess((input) => {
  if (typeof input !== 'object' || input === null) return input
  if (!('materialType' in input)) {
    return { materialType: 'standard', ...input }
  }
  return input
}, z.discriminatedUnion('materialType', [StandardMaterialSchema]))
export type MeshMaterial = z.infer<typeof MeshMaterialSchema>

export function normalizeMeshMaterial(data: unknown): MeshMaterial {
  return MeshMaterialSchema.parse(data)
}

/** Switch material type while preserving shared fields when possible. */
export function switchMaterialType(current: MeshMaterial, type: MaterialType): MeshMaterial {
  if (current.materialType === type) return current
  const next = defaultMaterialProperties(type)
  if ('color' in current && 'color' in next) {
    return { ...next, color: current.color }
  }
  return next
}
