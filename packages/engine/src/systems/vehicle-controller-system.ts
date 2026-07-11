import type { EntityId, IWorld, ISystem } from '@haku/core'
import {
  TransformComponent,
  VehicleComponent,
} from '@haku/core'
import type { Vehicle } from '@haku/schema'
import { vehicleWheelLocalPositions } from '@haku/schema'
import type {
  IRaycastVehicle,
  PhysicsWheelHandle,
  Quat,
  Vec3,
  WheelConfig,
} from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'

/** Programmatic drive input — consumed by T01.18 input binding later. */
export interface VehicleInput {
  /** Throttle axis −1 (reverse) … 1 (forward). */
  throttle?: number
  /** Steer axis −1 (left) … 1 (right). */
  steer?: number
  /** Raise speed cap and apply boost multiplier. */
  boost?: boolean
  /** Request jump (buffered until grounded). */
  jump?: boolean
  /** Handbrake — extra brake on rear wheels. */
  brake?: boolean
}

const FORWARD_LOCAL: Vec3 = [0, 0, 1]
const COAST_BRAKE = 1.2
const MPS_TO_KMH = 3.6
const MOVING_FORWARD_DOT = 0.5

interface TrackedVehicle {
  vehicle: IRaycastVehicle
  wheels: readonly [PhysicsWheelHandle, PhysicsWheelHandle, PhysicsWheelHandle, PhysicsWheelHandle]
  currentSteer: number
  jumpCooldown: number
  jumpBuffer: number
}

export interface DriveControlState {
  currentSteer: number
  engineForce: number
  brake: number
  handbrakeRear: boolean
  jumpCooldown: number
  jumpBuffer: number
  jumpApplied: boolean
}

export interface DriveControlContext {
  vehicle: Vehicle
  input: VehicleInput
  currentSteer: number
  jumpCooldown: number
  jumpBuffer: number
  linearVelocity: Vec3
  rotation: Quat
  grounded: boolean
  dt: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
  const [x, y, z] = v
  const [qx, qy, qz, qw] = q
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

function speedKmh(velocity: Vec3): number {
  const speed = Math.hypot(velocity[0], velocity[1], velocity[2])
  return speed * MPS_TO_KMH
}

function chassisForwardWorld(rotation: Quat): Vec3 {
  return rotateVec3ByQuat(FORWARD_LOCAL, rotation)
}

/** Build four {@link WheelConfig} entries from {@link VehicleComponent} data. */
export function vehicleWheelConfigs(vehicle: Vehicle): WheelConfig[] {
  const { wheels, suspension } = vehicle
  const base: Omit<WheelConfig, 'localPosition'> = {
    radius: wheels.radius,
    suspensionRestLength: suspension.restLength,
    suspensionStiffness: suspension.stiffness,
    dampingRelaxation: suspension.dampingRelaxation,
    dampingCompression: suspension.dampingCompression,
    maxSuspensionTravel: suspension.maxTravel,
    frictionSlip: suspension.frictionSlip,
    rollInfluence: suspension.rollInfluence,
  }

  return vehicleWheelLocalPositions(wheels).map((localPosition) => ({
    ...base,
    localPosition,
    maxSuspensionForce: vehicle.chassis.mass * 50,
  }))
}

/**
 * Reference-aligned drive / steer / brake / jump logic (Vehicle.js `_applyControls` + `_tryJump`).
 * Arcade assists (T01.15) intentionally omitted.
 */
export function computeDriveControlState(ctx: DriveControlContext): DriveControlState {
  const { vehicle, input, linearVelocity, rotation, grounded, dt } = ctx
  const { engine, steering, brakes, jump } = vehicle

  let jumpBuffer = ctx.jumpBuffer
  let jumpCooldown = ctx.jumpCooldown

  if (input.jump) {
    jumpBuffer = jump.bufferTime
  }
  jumpCooldown = Math.max(0, jumpCooldown - dt)
  jumpBuffer = Math.max(0, jumpBuffer - dt)

  let jumpApplied = false
  if (jumpBuffer > 0 && jumpCooldown <= 0 && grounded) {
    jumpApplied = true
    jumpCooldown = jump.cooldown
    jumpBuffer = 0
  }

  const steerInput = clamp(input.steer ?? 0, -1, 1)
  const targetSteer = -steerInput * steering.maxSteer
  const steerDelta = steering.steerSpeed * dt
  const currentSteer = clamp(
    targetSteer,
    ctx.currentSteer - steerDelta,
    ctx.currentSteer + steerDelta,
  )

  const speed = speedKmh(linearVelocity)
  const boosting = input.boost === true
  const speedCap = boosting ? engine.maxSpeedKmh : engine.cruiseSpeedKmh

  const throttleInput = clamp(input.throttle ?? 0, -1, 1)
  const forwardInput = throttleInput > 0.05
  const backwardInput = throttleInput < -0.05
  const throttleAmount = Math.min(1, Math.abs(throttleInput))

  const forward = chassisForwardWorld(rotation)
  let engineForce = 0
  if (forwardInput && speed < speedCap) {
    engineForce =
      -engine.force * (boosting ? engine.boostMultiplier : 1) * throttleAmount
  } else if (backwardInput) {
    const movingForward = dotVec3(linearVelocity, forward) > MOVING_FORWARD_DOT
    engineForce = movingForward ? 0 : engine.force * engine.reverseFactor * throttleAmount
  }

  let brake = 0
  if (backwardInput && dotVec3(linearVelocity, forward) > MOVING_FORWARD_DOT) {
    brake = brakes.brakeForce
  }
  if (!forwardInput && !backwardInput) {
    brake = COAST_BRAKE
  }

  const handbrakeRear = input.brake === true

  return {
    currentSteer,
    engineForce,
    brake,
    handbrakeRear,
    jumpCooldown,
    jumpBuffer,
    jumpApplied,
  }
}

/**
 * Applies rear-wheel drive, smoothed steering, coast/service brake, boost cap, and jump
 * for entities with {@link VehicleComponent} and a physics body from {@link PhysicsColliderSystem}.
 */
export class VehicleControllerSystem implements ISystem {
  readonly order = 48

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly inputs = new Map<string, VehicleInput>()
  private readonly tracked = new Map<string, TrackedVehicle>()
  private bootstrapped = false

  constructor(physicsSystem: PhysicsWorldSystem) {
    this.physicsSystem = physicsSystem
  }

  /** Set programmatic drive input for an entity (T01.18 will bind actions here). */
  setVehicleInput(id: EntityId, input: VehicleInput): void {
    this.inputs.set(id.value, { ...input })
  }

  clearVehicleInput(id: EntityId): void {
    this.inputs.delete(id.value)
  }

  getVehicleInput(id: EntityId): VehicleInput | undefined {
    return this.inputs.get(id.value)
  }

  /** Smoothed steer angle for tests and debug (radians). */
  getCurrentSteer(id: EntityId): number | undefined {
    return this.tracked.get(id.value)?.currentSteer
  }

  /** Raycast vehicle instance for visual sync (T01.14) and debug. */
  getRaycastVehicle(id: EntityId): IRaycastVehicle | undefined {
    return this.tracked.get(id.value)?.vehicle
  }

  /** Clear drive input and internal steer/jump state after respawn. */
  resetVehicleState(id: EntityId): void {
    this.clearVehicleInput(id)
    const tracked = this.tracked.get(id.value)
    if (!tracked) {
      return
    }
    tracked.currentSteer = 0
    tracked.jumpCooldown = 0
    tracked.jumpBuffer = 0
    const [fl, fr, bl, br] = tracked.wheels
    tracked.vehicle.setSteering(fl, 0)
    tracked.vehicle.setSteering(fr, 0)
    tracked.vehicle.applyEngineForce(bl, 0)
    tracked.vehicle.applyEngineForce(br, 0)
    for (const wheel of tracked.wheels) {
      tracked.vehicle.setBrake(wheel, 0)
    }
  }

  update(world: IWorld, dt: number): void {
    if (!this.bootstrapped) {
      this.bootstrap(world)
      this.bootstrapped = true
    }

    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (!physicsWorld) {
      return
    }

    for (const [entityIdValue, tracked] of this.tracked) {
      const id = { value: entityIdValue } as EntityId
      const vehicleData = world.getComponent(id, VehicleComponent)
      if (!vehicleData?.enabled) {
        continue
      }

      const bodyHandle = this.physicsSystem.getBodyHandle(id)
      if (!bodyHandle) {
        continue
      }

      const transform = world.getComponent(id, TransformComponent)
      if (!transform) {
        continue
      }

      const input = this.inputs.get(entityIdValue) ?? {}
      const linearVelocity =
        this.physicsSystem.getBodyLinearVelocity(id) ?? ([0, 0, 0] as Vec3)
      const wheelStates = tracked.vehicle.getWheelStates()
      const grounded = wheelStates.some((state) => state.inContact)

      const drive = computeDriveControlState({
        vehicle: vehicleData,
        input,
        currentSteer: tracked.currentSteer,
        jumpCooldown: tracked.jumpCooldown,
        jumpBuffer: tracked.jumpBuffer,
        linearVelocity,
        rotation: transform.rotation as Quat,
        grounded,
        dt,
      })

      tracked.currentSteer = drive.currentSteer
      tracked.jumpCooldown = drive.jumpCooldown
      tracked.jumpBuffer = drive.jumpBuffer

      const [fl, fr, bl, br] = tracked.wheels
      tracked.vehicle.setSteering(fl, drive.currentSteer)
      tracked.vehicle.setSteering(fr, drive.currentSteer)
      tracked.vehicle.applyEngineForce(bl, drive.engineForce)
      tracked.vehicle.applyEngineForce(br, drive.engineForce)

      for (const wheel of tracked.wheels) {
        tracked.vehicle.setBrake(wheel, drive.brake)
      }
      if (drive.handbrakeRear) {
        tracked.vehicle.setBrake(bl, vehicleData.brakes.handbrakeForce)
        tracked.vehicle.setBrake(br, vehicleData.brakes.handbrakeForce)
      }

      if (drive.jumpApplied) {
        physicsWorld.applyImpulse(bodyHandle, [0, vehicleData.jump.impulse, 0])
        const mass = vehicleData.chassis.mass
        const minVy = vehicleData.jump.impulse / mass
        const updated = this.physicsSystem.getBodyLinearVelocity(id) ?? linearVelocity
        if (updated[1] < minVy) {
          this.physicsSystem.setBodyLinearVelocity(id, [
            updated[0],
            minVy,
            updated[2],
          ])
        }
      }
    }
  }

  bootstrap(world: IWorld): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (!physicsWorld) {
      return
    }

    for (const id of world.query(VehicleComponent, TransformComponent)) {
      const vehicleData = world.getComponent(id, VehicleComponent)
      if (!vehicleData) {
        continue
      }

      const bodyHandle = this.physicsSystem.getBodyHandle(id)
      if (!bodyHandle) {
        continue
      }

      const raycastVehicle = physicsWorld.createRaycastVehicle(bodyHandle)
      const configs = vehicleWheelConfigs(vehicleData)
      const wheels = configs.map((config) => raycastVehicle.addWheel(config))
      if (wheels.length !== 4) {
        continue
      }

      this.tracked.set(id.value, {
        vehicle: raycastVehicle,
        wheels: [wheels[0]!, wheels[1]!, wheels[2]!, wheels[3]!],
        currentSteer: 0,
        jumpCooldown: 0,
        jumpBuffer: 0,
      })
    }
  }

  dispose(): void {
    this.tracked.clear()
    this.inputs.clear()
    this.bootstrapped = false
  }
}
