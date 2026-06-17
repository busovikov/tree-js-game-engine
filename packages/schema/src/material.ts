import { z } from 'zod'

export const MaterialTypeSchema = z.enum([
  'standard',
  'basic',
  'physical',
  'toon',
  'matcap',
  'normal',
  'depth',
])
export type MaterialType = z.infer<typeof MaterialTypeSchema>

export const MATERIAL_TYPES = MaterialTypeSchema.options

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  standard: 'Standard (PBR)',
  basic: 'Basic (Unlit)',
  physical: 'Physical (Advanced PBR)',
  toon: 'Toon',
  matcap: 'Matcap',
  normal: 'Normal (Debug)',
  depth: 'Depth',
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
  group?: 'advanced'
}

export const MaterialCommonSchema = z.object({
  color: z.string().default('#6699ff'),
  opacity: z.number().min(0).max(1).default(1),
  transparent: z.boolean().default(false),
  wireframe: z.boolean().default(false),
})

export const StandardMaterialSchema = MaterialCommonSchema.extend({
  materialType: z.literal('standard'),
  metalness: z.number().min(0).max(1).default(0),
  roughness: z.number().min(0).max(1).default(0.5),
})
export type StandardMaterial = z.infer<typeof StandardMaterialSchema>

export const BasicMaterialSchema = MaterialCommonSchema.extend({
  materialType: z.literal('basic'),
})
export type BasicMaterial = z.infer<typeof BasicMaterialSchema>

export const PhysicalMaterialSchema = StandardMaterialSchema.extend({
  materialType: z.literal('physical'),
  clearcoat: z.number().min(0).max(1).default(0),
  clearcoatRoughness: z.number().min(0).max(1).default(0),
  transmission: z.number().min(0).max(1).default(0),
  thickness: z.number().min(0).default(0),
  ior: z.number().min(1).max(2.5).default(1.5),
  attenuationColor: z.string().default('#ffffff'),
  attenuationDistance: z.number().min(0).default(0),
})
export type PhysicalMaterial = z.infer<typeof PhysicalMaterialSchema>

export const ToonMaterialSchema = MaterialCommonSchema.extend({
  materialType: z.literal('toon'),
})
export type ToonMaterial = z.infer<typeof ToonMaterialSchema>

export const MatcapMaterialSchema = MaterialCommonSchema.extend({
  materialType: z.literal('matcap'),
})
export type MatcapMaterial = z.infer<typeof MatcapMaterialSchema>

export const NormalMaterialSchema = z.object({
  materialType: z.literal('normal'),
  flatShading: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  transparent: z.boolean().default(false),
})
export type NormalMaterial = z.infer<typeof NormalMaterialSchema>

export const DepthMaterialSchema = z.object({
  materialType: z.literal('depth'),
  depthPacking: z.enum(['basic', 'rgba']).default('basic'),
  opacity: z.number().min(0).max(1).default(1),
})
export type DepthMaterial = z.infer<typeof DepthMaterialSchema>

/** Maps each material type to its Zod schema for editable properties. */
export const MATERIAL_TYPE_SCHEMAS = {
  standard: StandardMaterialSchema,
  basic: BasicMaterialSchema,
  physical: PhysicalMaterialSchema,
  toon: ToonMaterialSchema,
  matcap: MatcapMaterialSchema,
  normal: NormalMaterialSchema,
  depth: DepthMaterialSchema,
} as const satisfies Record<MaterialType, z.ZodType>

const commonSpecs: MaterialPropertySpec[] = [
  { key: 'color', label: 'Color', kind: 'color', default: '#6699ff', hint: 'Base color of the material.' },
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
]

export const MATERIAL_PROPERTY_SPECS: Record<MaterialType, MaterialPropertySpec[]> = {
  standard: [
    ...commonSpecs,
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
  ],
  basic: commonSpecs,
  physical: [
    ...commonSpecs,
    {
      key: 'metalness',
      label: 'Metalness',
      kind: 'number',
      default: 0,
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: 'roughness',
      label: 'Roughness',
      kind: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: 'clearcoat',
      label: 'Clearcoat',
      kind: 'number',
      default: 0,
      min: 0,
      max: 1,
      step: 0.05,
      group: 'advanced',
    },
    {
      key: 'clearcoatRoughness',
      label: 'Clearcoat Roughness',
      kind: 'number',
      default: 0,
      min: 0,
      max: 1,
      step: 0.05,
      group: 'advanced',
    },
    {
      key: 'transmission',
      label: 'Transmission',
      kind: 'number',
      default: 0,
      min: 0,
      max: 1,
      step: 0.05,
      group: 'advanced',
    },
    {
      key: 'thickness',
      label: 'Thickness',
      kind: 'number',
      default: 0,
      min: 0,
      step: 0.1,
      group: 'advanced',
    },
    {
      key: 'ior',
      label: 'IOR',
      kind: 'number',
      default: 1.5,
      min: 1,
      max: 2.5,
      step: 0.01,
      group: 'advanced',
    },
    {
      key: 'attenuationColor',
      label: 'Attenuation Color',
      kind: 'color',
      default: '#ffffff',
      group: 'advanced',
    },
    {
      key: 'attenuationDistance',
      label: 'Attenuation Distance',
      kind: 'number',
      default: 0,
      min: 0,
      step: 0.1,
      group: 'advanced',
    },
  ],
  toon: [
    { key: 'color', label: 'Color', kind: 'color', default: '#6699ff' },
    {
      key: 'opacity',
      label: 'Opacity',
      kind: 'number',
      default: 1,
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: 'transparent',
      label: 'Transparent',
      kind: 'boolean',
      default: false,
    },
  ],
  matcap: [
    { key: 'color', label: 'Color', kind: 'color', default: '#6699ff' },
    {
      key: 'opacity',
      label: 'Opacity',
      kind: 'number',
      default: 1,
      min: 0,
      max: 1,
      step: 0.05,
    },
  ],
  normal: [
    {
      key: 'flatShading',
      label: 'Flat Shading',
      kind: 'boolean',
      default: false,
    },
    {
      key: 'opacity',
      label: 'Opacity',
      kind: 'number',
      default: 1,
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: 'transparent',
      label: 'Transparent',
      kind: 'boolean',
      default: false,
    },
  ],
  depth: [
    {
      key: 'depthPacking',
      label: 'Depth Packing',
      kind: 'number',
      default: 0,
      hint: 'basic or rgba — stored as enum in schema',
    },
    {
      key: 'opacity',
      label: 'Opacity',
      kind: 'number',
      default: 1,
      min: 0,
      max: 1,
      step: 0.05,
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
}, z.discriminatedUnion('materialType', [
  StandardMaterialSchema,
  BasicMaterialSchema,
  PhysicalMaterialSchema,
  ToonMaterialSchema,
  MatcapMaterialSchema,
  NormalMaterialSchema,
  DepthMaterialSchema,
]))
export type MeshMaterial = z.infer<typeof MeshMaterialSchema>

export function normalizeMeshMaterial(data: unknown): MeshMaterial {
  return MeshMaterialSchema.parse(data)
}

const PBR_TYPES = new Set<MaterialType>(['standard', 'physical'])

/** Switch material type while preserving shared fields when possible. */
export function switchMaterialType(current: MeshMaterial, type: MaterialType): MeshMaterial {
  if (current.materialType === type) return current
  const next = defaultMaterialProperties(type)
  const result = { ...next } as Record<string, unknown>

  if ('color' in current && 'color' in next) result.color = current.color
  if ('opacity' in current && 'opacity' in next) result.opacity = current.opacity
  if ('transparent' in current && 'transparent' in next) result.transparent = current.transparent
  if ('wireframe' in current && 'wireframe' in next) result.wireframe = current.wireframe
  if (PBR_TYPES.has(current.materialType) && PBR_TYPES.has(type)) {
    if ('metalness' in current && 'metalness' in next) result.metalness = current.metalness
    if ('roughness' in current && 'roughness' in next) result.roughness = current.roughness
  }

  return normalizeMeshMaterial(result)
}
