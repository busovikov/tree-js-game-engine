/** Opaque handle to a simulation world slot (multi-world API). */
export interface PhysicsWorldHandle {
  readonly __brand: 'PhysicsWorldHandle'
  readonly value: string
}

export function physicsWorldHandle(value: string): PhysicsWorldHandle {
  return { __brand: 'PhysicsWorldHandle', value }
}

/** Opaque handle to a rigid body in the physics simulation. */
export interface PhysicsBodyHandle {
  readonly __brand: 'PhysicsBodyHandle'
  readonly value: string
}

/** Opaque handle to a collider shape attached to a body. */
export interface PhysicsShapeHandle {
  readonly __brand: 'PhysicsShapeHandle'
  readonly value: string
}

/** Opaque handle to a raycast vehicle wheel. */
export interface PhysicsWheelHandle {
  readonly __brand: 'PhysicsWheelHandle'
  readonly value: string
}

export function physicsBodyHandle(value: string): PhysicsBodyHandle {
  return { __brand: 'PhysicsBodyHandle', value }
}

export function physicsShapeHandle(value: string): PhysicsShapeHandle {
  return { __brand: 'PhysicsShapeHandle', value }
}

export function physicsWheelHandle(value: string): PhysicsWheelHandle {
  return { __brand: 'PhysicsWheelHandle', value }
}
