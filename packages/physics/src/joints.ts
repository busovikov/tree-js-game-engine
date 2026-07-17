import type { PhysicsBodyHandle } from './handles.js'
import type { Vec3 } from './types.js'

/** Opaque impulse joint handle (spherical / spring / rope / revolute motor / scene joint). */
export interface PhysicsJointHandle {
  readonly __brand: 'PhysicsJointHandle'
  readonly value: string
}

export function physicsJointHandle(value: string): PhysicsJointHandle {
  return { __brand: 'PhysicsJointHandle', value }
}

export type PointerJointKind = 'spherical' | 'spring' | 'rope'

export interface PointerJointConfig {
  kind: PointerJointKind
  /** Kinematic pointer anchor body. */
  pointerBody: PhysicsBodyHandle
  /** Dragged dynamic body. */
  targetBody: PhysicsBodyHandle
  /** Hit point in target body local space. */
  targetAnchorLocal: Vec3
  springStiffness?: number
  springDamping?: number
  ropeLength?: number
}

export interface RevoluteMotorJointConfig {
  bodyA: PhysicsBodyHandle
  bodyB: PhysicsBodyHandle
  anchorA: Vec3
  anchorB: Vec3
  axis: Vec3
}

/**
 * Prismatic joint driven by a position (spring) motor — a compliant suspension strut. The bodies are
 * constrained to slide along `axis`; the motor pulls the separation back toward `restLength` with the
 * given `stiffness`/`damping` (a spring-damper). `limits` clamps the travel. Passive: configured once
 * at creation, no per-frame updates.
 */
export interface PrismaticSpringJointConfig {
  bodyA: PhysicsBodyHandle
  bodyB: PhysicsBodyHandle
  anchorA: Vec3
  anchorB: Vec3
  axis: Vec3
  restLength: number
  stiffness: number
  damping: number
  limits?: { min: number; max: number }
}

/** Scene-authored joint between two rigid bodies. */
export interface SceneJointConfig {
  type: 'fixed' | 'revolute' | 'prismatic' | 'spherical' | 'spring' | 'rope'
  bodyA: PhysicsBodyHandle
  bodyB: PhysicsBodyHandle
  anchorA: Vec3
  anchorB: Vec3
  axis?: Vec3
  limits?: { min: number; max: number }
  motor?: { velocity: number; maxForce: number }
  spring?: { stiffness: number; damping: number; restLength?: number }
  ropeLength?: number
}
