import { z } from 'zod'
import { MeshMaterialSchema } from './material.js'

export const MeshGeometryTypeSchema = z.enum([
  'BoxGeometry',
  'SphereGeometry',
  'PlaneGeometry',
  'CylinderGeometry',
  'ConeGeometry',
  'TorusGeometry',
  'RingGeometry',
  'CapsuleGeometry',
  'ModelGeometry',
])
export type MeshGeometryType = z.infer<typeof MeshGeometryTypeSchema>

export const MESH_GEOMETRY_TYPES = MeshGeometryTypeSchema.options

export const MESH_GEOMETRY_TYPE_LABELS: Record<MeshGeometryType, string> = {
  BoxGeometry: 'Cube',
  SphereGeometry: 'Sphere',
  PlaneGeometry: 'Plane',
  CylinderGeometry: 'Cylinder',
  ConeGeometry: 'Cone',
  TorusGeometry: 'Torus',
  RingGeometry: 'Ring',
  CapsuleGeometry: 'Capsule',
  ModelGeometry: 'Model',
}

export const MESH_PRIMITIVE_GEOMETRY_TYPES = MESH_GEOMETRY_TYPES.filter(
  (type) => type !== 'ModelGeometry',
)

export interface GeometryParamSpec {
  key: string
  label: string
  default: number
  min?: number
  max?: number
  step?: number
}

export const GEOMETRY_PARAM_SPECS: Record<MeshGeometryType, GeometryParamSpec[]> = {
  BoxGeometry: [
    { key: 'width', label: 'Width', default: 1, min: 0.01, step: 0.1 },
    { key: 'height', label: 'Height', default: 1, min: 0.01, step: 0.1 },
    { key: 'depth', label: 'Depth', default: 1, min: 0.01, step: 0.1 },
  ],
  SphereGeometry: [
    { key: 'radius', label: 'Radius', default: 0.5, min: 0.01, step: 0.1 },
    { key: 'widthSegments', label: 'Width Segments', default: 32, min: 3, max: 64, step: 1 },
    { key: 'heightSegments', label: 'Height Segments', default: 16, min: 2, max: 64, step: 1 },
  ],
  PlaneGeometry: [
    { key: 'width', label: 'Width', default: 1, min: 0.01, step: 0.1 },
    { key: 'height', label: 'Height', default: 1, min: 0.01, step: 0.1 },
  ],
  CylinderGeometry: [
    { key: 'radiusTop', label: 'Radius Top', default: 0.5, min: 0, step: 0.1 },
    { key: 'radiusBottom', label: 'Radius Bottom', default: 0.5, min: 0, step: 0.1 },
    { key: 'height', label: 'Height', default: 1, min: 0.01, step: 0.1 },
    { key: 'radialSegments', label: 'Radial Segments', default: 32, min: 3, max: 64, step: 1 },
  ],
  ConeGeometry: [
    { key: 'radius', label: 'Radius', default: 0.5, min: 0.01, step: 0.1 },
    { key: 'height', label: 'Height', default: 1, min: 0.01, step: 0.1 },
    { key: 'radialSegments', label: 'Radial Segments', default: 32, min: 3, max: 64, step: 1 },
  ],
  TorusGeometry: [
    { key: 'radius', label: 'Radius', default: 0.5, min: 0.01, step: 0.1 },
    { key: 'tube', label: 'Tube', default: 0.2, min: 0.01, step: 0.05 },
    { key: 'radialSegments', label: 'Radial Segments', default: 12, min: 3, max: 64, step: 1 },
    { key: 'tubularSegments', label: 'Tubular Segments', default: 48, min: 3, max: 128, step: 1 },
  ],
  RingGeometry: [
    { key: 'innerRadius', label: 'Inner Radius', default: 0.25, min: 0, step: 0.05 },
    { key: 'outerRadius', label: 'Outer Radius', default: 0.5, min: 0.01, step: 0.05 },
    { key: 'thetaSegments', label: 'Theta Segments', default: 32, min: 3, max: 64, step: 1 },
  ],
  CapsuleGeometry: [
    { key: 'radius', label: 'Radius', default: 0.35, min: 0.01, step: 0.05 },
    { key: 'length', label: 'Length', default: 1, min: 0.01, step: 0.1 },
    { key: 'capSegments', label: 'Cap Segments', default: 4, min: 1, max: 32, step: 1 },
    { key: 'radialSegments', label: 'Radial Segments', default: 8, min: 3, max: 64, step: 1 },
  ],
  ModelGeometry: [],
}

export function defaultGeometryParams(type: MeshGeometryType): Record<string, number> {
  const params: Record<string, number> = {}
  for (const spec of GEOMETRY_PARAM_SPECS[type]) {
    params[spec.key] = spec.default
  }
  return params
}

export { MeshMaterialSchema, type MeshMaterial } from './material.js'

const MeshRendererBaseSchema = z.object({
  geometryType: MeshGeometryTypeSchema.default('BoxGeometry'),
  geometryParams: z.record(z.number()).default({}),
  modelAsset: z.string().default(''),
  material: MeshMaterialSchema.default({}),
  castShadow: z.boolean().default(true),
  receiveShadow: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

export const MeshRendererSchema = z.preprocess((input) => {
  if (typeof input !== 'object' || input === null) return input
  if ('prototypeId' in input && !('geometryType' in input)) {
    return {
      geometryType: 'BoxGeometry',
      geometryParams: defaultGeometryParams('BoxGeometry'),
      material: {},
    }
  }
  return input
}, MeshRendererBaseSchema)
export type MeshRenderer = z.infer<typeof MeshRendererSchema>

export function normalizeMeshRenderer(data: unknown): MeshRenderer {
  return MeshRendererSchema.parse(data)
}

export function meshRendererKey(data: MeshRenderer | unknown): string {
  return JSON.stringify(normalizeMeshRenderer(data))
}
