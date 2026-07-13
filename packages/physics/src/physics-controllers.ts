import type { PhysicsBodyHandle, PhysicsShapeHandle } from './handles.js'
import type { Vec3 } from './types.js'

/** Backend-agnostic kinematic character controller (Rapier KinematicCharacterController). */
export interface ICharacterController {
  readonly body: PhysicsBodyHandle
  readonly collider: PhysicsShapeHandle

  /** Reconfigure autostep / snap / impulse flags when component params change. */
  configure(options: CharacterControllerOptions): void

  /** Advance controller for one frame; returns whether grounded. */
  step(movement: Vec3, dt: number): CharacterControllerStepResult
}

export interface CharacterControllerOptions {
  offset: number
  snapToGroundDistance: number
  autoStepMaxHeight: number
  autoStepMinWidth: number
  autoStepIncludeDynamicBodies: boolean
  applyImpulsesToDynamicBodies: boolean
}

export interface CharacterControllerStepResult {
  grounded: boolean
  movement: Vec3
}

/** Rapier DynamicRaycastVehicleController wrapper. */
export interface IDynamicRaycastVehicle {
  readonly chassis: PhysicsBodyHandle

  addWheel(config: DynamicRaycastWheelConfig): number
  updateVehicle(dt: number): void

  setWheelEngineForce(wheelIndex: number, force: number): void
  setWheelBrake(wheelIndex: number, strength: number): void
  setWheelSteering(wheelIndex: number, angle: number): void

  getWheelSteering(wheelIndex: number): number
  getWheelRotation(wheelIndex: number): number
  getWheelSuspensionLength(wheelIndex: number): number
  getWheelChassisConnectionY(wheelIndex: number): number
  getWheelAxle(wheelIndex: number): Vec3
  getWheelIsInContact(wheelIndex: number): boolean
}

export interface DynamicRaycastWheelConfig {
  localPosition: Vec3
  directionLocal?: Vec3
  axleLocal?: Vec3
  radius: number
  suspensionRestLength: number
  suspensionStiffness: number
  maxSuspensionTravel?: number
  frictionSlip: number
  sideFrictionStiffness?: number
}

