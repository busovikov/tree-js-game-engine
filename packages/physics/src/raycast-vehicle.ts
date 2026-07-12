import type { PhysicsBodyHandle, PhysicsWheelHandle } from './handles.js'
import type { Vec3 } from './types.js'

/** Wheel placement and suspension parameters (Isaac Mason raycast vehicle shape). */
export interface WheelConfig {
  localPosition: Vec3
  /** Ray direction in chassis local space (default `[0, -1, 0]`). */
  directionLocal?: Vec3
  /** Wheel axle in chassis local space (default `[1, 0, 0]`). */
  axleLocal?: Vec3
  radius: number
  suspensionRestLength: number
  suspensionStiffness: number
  /** Damper when suspension extends (rebound). */
  dampingRelaxation: number
  /** Damper when suspension compresses. */
  dampingCompression: number
  maxSuspensionTravel: number
  frictionSlip: number
  rollInfluence: number
  /** Optional cap on per-wheel suspension force (default 100000). */
  maxSuspensionForce?: number
  /** Lateral friction scale (default 1). */
  sideFrictionStiffness?: number
  /** Longitudinal slip cap divisor (default 1). */
  forwardAcceleration?: number
  /** Lateral slip cap divisor (default 1). */
  sideAcceleration?: number
}

/** Runtime state of a single raycast wheel after a simulation step. */
export interface WheelState {
  wheel: PhysicsWheelHandle
  inContact: boolean
  contactPoint: Vec3 | null
  suspensionLength: number
  rotation: number
  steering: number
  engineForce: number
}

/**
 * Raycast vehicle controller — backend-agnostic interface.
 * Implementations (Rapier, box3D) hide WASM details behind this contract.
 */
export interface IRaycastVehicle {
  readonly chassis: PhysicsBodyHandle

  addWheel(config: WheelConfig): PhysicsWheelHandle
  removeWheel(wheel: PhysicsWheelHandle): void

  applyEngineForce(wheel: PhysicsWheelHandle, force: number): void
  setSteering(wheel: PhysicsWheelHandle, angle: number): void
  setBrake(wheel: PhysicsWheelHandle, strength: number): void

  getWheelStates(): readonly WheelState[]
}
