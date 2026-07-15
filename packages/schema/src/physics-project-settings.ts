import { z } from 'zod'
import { PhysicsMaterialSchema, type PhysicsMaterial } from './physics-material.js'

/** Rapier supports 16 collision groups (not Unity/Godot 32). */
export const MAX_PHYSICS_LAYERS = 16

export const DEFAULT_PHYSICS_MATERIAL_ID = 'default'

export function defaultPhysicsMaterials(): Record<string, PhysicsMaterial> {
  return {
    [DEFAULT_PHYSICS_MATERIAL_ID]: PhysicsMaterialSchema.parse({}),
  }
}

const LayerIndexSchema = z.number().int().min(0).max(MAX_PHYSICS_LAYERS - 1)

const LayerNameSchema = z.string().min(1)

const LayerNamesSchema = z
  .array(LayerNameSchema)
  .length(MAX_PHYSICS_LAYERS)
  .default(defaultPhysicsLayerNames())

const LayerCollisionMatrixSchema = z
  .array(z.array(z.boolean()).length(MAX_PHYSICS_LAYERS))
  .length(MAX_PHYSICS_LAYERS)
  .default(defaultLayerCollisionMatrix())

export const PhysicsProjectSettingsSchema = z.preprocess((input) => {
  if (typeof input !== 'object' || input === null) return input
  const next = input as Record<string, unknown>
  if (!('materials' in next)) {
    return { ...next, materials: defaultPhysicsMaterials() }
  }
  return next
}, z.object({
  /** Display names for layers 0..15. */
  layers: LayerNamesSchema,
  /** Symmetric collision matrix; editor mirrors upper triangle. */
  layerCollisionMatrix: LayerCollisionMatrixSchema,
  /** Project physics material assets referenced by Collider.materialId. */
  materials: z.record(z.string(), PhysicsMaterialSchema).default(defaultPhysicsMaterials()),
}))
export type PhysicsProjectSettings = z.infer<typeof PhysicsProjectSettingsSchema>

export function defaultPhysicsLayerNames(): string[] {
  const names = ['Default']
  for (let i = 1; i < MAX_PHYSICS_LAYERS; i++) {
    names.push(`Layer ${i}`)
  }
  return names
}

export function defaultLayerCollisionMatrix(): boolean[][] {
  return Array.from({ length: MAX_PHYSICS_LAYERS }, () =>
    Array.from({ length: MAX_PHYSICS_LAYERS }, () => true),
  )
}

export function defaultPhysicsProjectSettings(): PhysicsProjectSettings {
  return PhysicsProjectSettingsSchema.parse({})
}

/** Validates a collider layer index against project capabilities. */
export function isValidPhysicsLayer(
  layer: number,
  maxLayers: number = MAX_PHYSICS_LAYERS,
): boolean {
  return Number.isInteger(layer) && layer >= 0 && layer < maxLayers
}

/** Packs Unity-style layer index + symmetric matrix into Rapier collision groups. */
export function bakeLayerCollisionGroups(
  layer: number,
  matrix: boolean[][],
): number {
  const membership = 1 << layer
  let filter = 0
  for (let j = 0; j < MAX_PHYSICS_LAYERS; j++) {
    if (matrix[layer]?.[j]) {
      filter |= 1 << j
    }
  }
  return (membership << 16) | filter
}

/** Updates one symmetric pair in the collision matrix (editor layer matrix UI). */
export function setLayerCollisionSymmetric(
  matrix: boolean[][],
  row: number,
  col: number,
  value: boolean,
): boolean[][] {
  const next = matrix.map((entry) => [...entry])
  next[row]![col] = value
  next[col]![row] = value
  return next
}

/** Resolves collider material asset with optional inline friction/restitution overrides. */
export function resolveColliderPhysicsMaterial(
  settings: PhysicsProjectSettings,
  collider: { materialId: string; friction?: number; restitution?: number },
): Pick<
  PhysicsMaterial,
  'friction' | 'restitution' | 'density' | 'frictionCombine' | 'restitutionCombine'
> {
  const materialId = collider.materialId || DEFAULT_PHYSICS_MATERIAL_ID
  const asset =
    settings.materials[materialId] ??
    settings.materials[DEFAULT_PHYSICS_MATERIAL_ID] ??
    PhysicsMaterialSchema.parse({})
  return {
    friction: collider.friction ?? asset.friction,
    restitution: collider.restitution ?? asset.restitution,
    density: asset.density,
    frictionCombine: asset.frictionCombine,
    restitutionCombine: asset.restitutionCombine,
  }
}

export { LayerIndexSchema }
