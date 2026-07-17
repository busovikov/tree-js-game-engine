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
  hint?: string
}

export const GEOMETRY_PARAM_SPECS: Record<MeshGeometryType, GeometryParamSpec[]> = {
  BoxGeometry: [
    { key: 'width', label: 'Width', default: 1, min: 0.01, step: 0.1, hint: 'Box size along the X axis.' },
    { key: 'height', label: 'Height', default: 1, min: 0.01, step: 0.1, hint: 'Box size along the Y axis.' },
    { key: 'depth', label: 'Depth', default: 1, min: 0.01, step: 0.1, hint: 'Box size along the Z axis.' },
  ],
  SphereGeometry: [
    { key: 'radius', label: 'Radius', default: 0.5, min: 0.01, step: 0.1, hint: 'Sphere radius.' },
    { key: 'widthSegments', label: 'Width Segments', default: 32, min: 3, max: 64, step: 1, hint: 'Horizontal mesh subdivisions — more segments = smoother sphere.' },
    { key: 'heightSegments', label: 'Height Segments', default: 16, min: 2, max: 64, step: 1, hint: 'Vertical mesh subdivisions — more segments = smoother sphere.' },
  ],
  PlaneGeometry: [
    { key: 'width', label: 'Width', default: 1, min: 0.01, step: 0.1, hint: 'Plane size along the X axis.' },
    { key: 'height', label: 'Height', default: 1, min: 0.01, step: 0.1, hint: 'Plane size along the Y axis.' },
  ],
  CylinderGeometry: [
    { key: 'radiusTop', label: 'Radius Top', default: 0.5, min: 0, step: 0.1, hint: 'Radius of the top cap (0 = cone tip).' },
    { key: 'radiusBottom', label: 'Radius Bottom', default: 0.5, min: 0, step: 0.1, hint: 'Radius of the bottom cap.' },
    { key: 'height', label: 'Height', default: 1, min: 0.01, step: 0.1, hint: 'Cylinder height along the Y axis.' },
    { key: 'radialSegments', label: 'Radial Segments', default: 32, min: 3, max: 64, step: 1, hint: 'Subdivisions around the circumference — more = rounder.' },
  ],
  ConeGeometry: [
    { key: 'radius', label: 'Radius', default: 0.5, min: 0.01, step: 0.1, hint: 'Radius of the cone base.' },
    { key: 'height', label: 'Height', default: 1, min: 0.01, step: 0.1, hint: 'Cone height along the Y axis.' },
    { key: 'radialSegments', label: 'Radial Segments', default: 32, min: 3, max: 64, step: 1, hint: 'Subdivisions around the circumference — more = rounder.' },
  ],
  TorusGeometry: [
    { key: 'radius', label: 'Radius', default: 0.5, min: 0.01, step: 0.1, hint: 'Distance from torus center to the tube center.' },
    { key: 'tube', label: 'Tube', default: 0.2, min: 0.01, step: 0.05, hint: 'Radius of the tube cross-section.' },
    { key: 'radialSegments', label: 'Radial Segments', default: 12, min: 3, max: 64, step: 1, hint: 'Subdivisions of the tube cross-section.' },
    { key: 'tubularSegments', label: 'Tubular Segments', default: 48, min: 3, max: 128, step: 1, hint: 'Subdivisions along the ring — more = smoother torus.' },
  ],
  RingGeometry: [
    { key: 'innerRadius', label: 'Inner Radius', default: 0.25, min: 0, step: 0.05, hint: 'Radius of the ring hole (0 = solid disc).' },
    { key: 'outerRadius', label: 'Outer Radius', default: 0.5, min: 0.01, step: 0.05, hint: 'Outer radius of the ring.' },
    { key: 'thetaSegments', label: 'Theta Segments', default: 32, min: 3, max: 64, step: 1, hint: 'Subdivisions around the ring — more = rounder.' },
  ],
  CapsuleGeometry: [
    { key: 'radius', label: 'Radius', default: 0.35, min: 0.01, step: 0.05, hint: 'Radius of the capsule caps and body.' },
    { key: 'length', label: 'Length', default: 1, min: 0.01, step: 0.1, hint: 'Length of the cylindrical middle section.' },
    { key: 'capSegments', label: 'Cap Segments', default: 4, min: 1, max: 32, step: 1, hint: 'Subdivisions of the hemispherical caps.' },
    { key: 'radialSegments', label: 'Radial Segments', default: 8, min: 3, max: 64, step: 1, hint: 'Subdivisions around the circumference — more = rounder.' },
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
