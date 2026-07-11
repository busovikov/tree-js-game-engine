import type { PhysicsBodyHandle, PhysicsWheelHandle } from './handles.js'
import type { Vec3 } from './types.js'

/** Wheel placement and suspension parameters (sketchbook / cannon-es compatible shape). */
export interface WheelConfig {
  localPosition: Vec3
  radius: number
  suspensionRestLength: number
  suspensionStiffness: number
  suspensionDamping: number
  maxSuspensionTravel: number
  frictionSlip: number
  rollInfluence: number
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
