import type { Collider } from './collider.js'
import type { RigidBody } from './rigid-body.js'

export interface PhysicsEntityComponents {
  collider?: Collider
  rigidBody?: RigidBody
}

export class PhysicsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhysicsValidationError'
  }
}

/** @haku policy: trimesh on dynamic bodies is forbidden (Godot concave=static-only). */
export function validateTrimeshOnDynamicBody(components: PhysicsEntityComponents): void {
  const { collider, rigidBody } = components
  if (!collider || collider.shape !== 'trimesh') {
    return
  }
  const bodyType = rigidBody?.type ?? 'static'
  if (bodyType === 'dynamic') {
    throw new PhysicsValidationError(
      'Trimesh collider cannot be used on a dynamic RigidBody. Use convexHull or primitive shapes.',
    )
  }
}

/** worldBoundary is valid only on static bodies. */
export function validateWorldBoundaryBodyType(components: PhysicsEntityComponents): void {
  const { collider, rigidBody } = components
  if (!collider || collider.shape !== 'worldBoundary') {
    return
  }
  const bodyType = rigidBody?.type ?? 'static'
  if (bodyType !== 'static') {
    throw new PhysicsValidationError(
      'worldBoundary collider is only valid on static bodies.',
    )
  }
}

export function validateEntityPhysicsComponents(components: PhysicsEntityComponents): void {
  validateTrimeshOnDynamicBody(components)
  validateWorldBoundaryBodyType(components)
}

/** Resolves simulation body type from ECS components (post-migration model). */
export function resolveBodyTypeFromComponents(
  rigidBody: RigidBody | undefined,
): 'static' | 'dynamic' | 'kinematic' {
  if (rigidBody && rigidBody.enabled !== false) {
    return rigidBody.type
  }
  // Collider-only entity → implicit static fixed body (Unity static collider).
  return 'static'
}
