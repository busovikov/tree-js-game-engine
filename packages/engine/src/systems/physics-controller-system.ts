import type { EntityId, IWorld, ISystem } from '@haku/core'
import {
  TransformComponent,
  PhysicsControllerComponent,
} from '@haku/core'
import type { CustomRaycastController } from '@haku/schema'
import { controllerWheelLocalPositions } from '@haku/schema'
import type {
  IRaycastVehicle,
  IDynamicRaycastVehicle,
  PhysicsWheelHandle,
  WheelConfig,
} from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'
import {
  bootstrapCharacter,
  bootstrapDynamicRaycast,
  bootstrapRevoluteVehicle,
  disposeRevoluteVehicle,
  ensureArcadeTracked,
  updateArcadeVehicle,
  updateCharacter,
  updateCustomSpring,
  updateDynamicRaycast,
  updateRevoluteVehicle,
  type TrackedArcadeVehicle,
  type TrackedCharacter,
  type TrackedDynamicRaycast,
  type TrackedRevoluteVehicle,
} from './physics-controller-runtime.js'
import { ISAAC_RAYCAST_PHYSICS_STEER_SIGN } from '../vehicle-model-fit.js'

/** Programmatic drive input — consumed by T01.18 input binding later. */
export interface ControllerInput {
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
  /** Sprint modifier for kinematic character controllers. */
  sprint?: boolean
}

/** @deprecated use ControllerInput */
export type VehicleInput = ControllerInput

interface TrackedCustomRaycast {
  vehicle: IRaycastVehicle
  wheels: readonly [PhysicsWheelHandle, PhysicsWheelHandle, PhysicsWheelHandle, PhysicsWheelHandle]
  currentSteer: number
}

export interface DriveControlState {
  currentSteer: number
  engineForce: number
  brake: number
}

export interface DriveControlContext {
  vehicle: CustomRaycastController
  input: ControllerInput
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Build four {@link WheelConfig} entries from {@link PhysicsControllerComponent} data. */
export function raycastWheelConfigs(controller: CustomRaycastController): WheelConfig[] {
  const { wheels, suspension } = controller
  const base: Omit<WheelConfig, 'localPosition'> = {
    radius: wheels.radius,
    directionLocal: [0, -1, 0],
    axleLocal: [1, 0, 0],
    suspensionRestLength: suspension.restLength,
    suspensionStiffness: suspension.stiffness,
    dampingRelaxation: suspension.dampingRelaxation,
    dampingCompression: suspension.dampingCompression,
    maxSuspensionTravel: suspension.maxTravel,
    frictionSlip: suspension.frictionSlip,
    rollInfluence: suspension.rollInfluence,
    sideFrictionStiffness: 1,
    forwardAcceleration: 1,
    sideAcceleration: 1,
    maxSuspensionForce: 100_000,
  }

  return controllerWheelLocalPositions(wheels).map((localPosition) => ({
    ...base,
    localPosition,
  }))
}

/** @deprecated use raycastWheelConfigs */
export const vehicleWheelConfigs = raycastWheelConfigs

/**
 * Steer sign: Haku input uses A→−1, D→+1. Isaac sketch (X-forward body) uses left→+steer, right→−steer;
 * {@link ISAAC_RAYCAST_PHYSICS_STEER_SIGN} aligns raycast physics after +Z-forward mapping.
 * Engine sign: Isaac `forwardWS = normal × axle` is −Z for Haku Y-up / X-axle wheels;
 * controller negates force so throttle forward drives +Z.
 */
/**
 * Isaac Mason `custom-raycast-vehicle` sketch controls — direct throttle/steer/brake, no speed cap,
 * no jump. 1:1 port of https://github.com/isaac-mason/sketches/tree/main/sketches/rapier/custom-raycast-vehicle
 */
export function computeIsaacDriveControlState(ctx: DriveControlContext): DriveControlState {
  const { vehicle, input } = ctx
  const { engine, steering, brakes } = vehicle

  const steerInput = clamp(input.steer ?? 0, -1, 1)
  const throttleInput = clamp(input.throttle ?? 0, -1, 1)

  let engineForce = 0
  if (throttleInput > 0.05) {
    engineForce = -engine.force * throttleInput
  } else if (throttleInput < -0.05) {
    engineForce = engine.force * Math.abs(throttleInput)
  }

  return {
    currentSteer: steerInput * steering.maxSteer,
    engineForce,
    brake: input.brake === true ? brakes.brakeForce : 0,
  }
}

/**
 * Applies rear-wheel drive and direct steer/brake for entities with {@link PhysicsControllerComponent}
 * and a physics body from {@link PhysicsColliderSystem}.
 */
export class PhysicsControllerSystem implements ISystem {
  readonly order = 48

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly inputs = new Map<string, ControllerInput>()
  private readonly customRaycast = new Map<string, TrackedCustomRaycast>()
  private readonly dynamicRaycast = new Map<string, TrackedDynamicRaycast>()
  private readonly arcadeVehicles = new Map<string, TrackedArcadeVehicle>()
  private readonly characters = new Map<string, TrackedCharacter>()
  private readonly revoluteVehicles = new Map<string, TrackedRevoluteVehicle>()
  private readonly disabledControllers = new Set<string>()
  private bootstrapped = false

  constructor(physicsSystem: PhysicsWorldSystem) {
    this.physicsSystem = physicsSystem
  }

  setControllerInput(id: EntityId, input: ControllerInput): void {
    this.inputs.set(id.value, { ...input })
  }

  /** @deprecated use setControllerInput */
  setVehicleInput(id: EntityId, input: ControllerInput): void {
    this.setControllerInput(id, input)
  }

  clearControllerInput(id: EntityId): void {
    this.inputs.delete(id.value)
  }

  /** @deprecated use clearControllerInput */
  clearVehicleInput(id: EntityId): void {
    this.clearControllerInput(id)
  }

  getControllerInput(id: EntityId): ControllerInput | undefined {
    return this.inputs.get(id.value)
  }

  /** @deprecated use getControllerInput */
  getVehicleInput(id: EntityId): ControllerInput | undefined {
    return this.getControllerInput(id)
  }

  getCurrentSteer(id: EntityId): number | undefined {
    return this.customRaycast.get(id.value)?.currentSteer
  }

  getRaycastVehicle(id: EntityId): IRaycastVehicle | undefined {
    return this.customRaycast.get(id.value)?.vehicle
  }

  getDynamicRaycastVehicle(id: EntityId): IDynamicRaycastVehicle | undefined {
    return this.dynamicRaycast.get(id.value)?.vehicle
  }

  getTrackedDynamicRaycast(id: EntityId): TrackedDynamicRaycast | undefined {
    return this.dynamicRaycast.get(id.value)
  }

  resetControllerState(id: EntityId): void {
    this.clearControllerInput(id)
    const custom = this.customRaycast.get(id.value)
    if (custom) {
      custom.currentSteer = 0
      const [fl, fr, bl, br] = custom.wheels
      custom.vehicle.setSteering(fl, 0)
      custom.vehicle.setSteering(fr, 0)
      custom.vehicle.applyEngineForce(bl, 0)
      custom.vehicle.applyEngineForce(br, 0)
      for (const wheel of custom.wheels) {
        custom.vehicle.setBrake(wheel, 0)
      }
    }

    const dynamic = this.dynamicRaycast.get(id.value)
    if (dynamic) {
      dynamic.accelerateForce = 0
      dynamic.brakeForceValue = 0
      dynamic.currentSteering = 0
      for (let i = 0; i < dynamic.wheelCount; i++) {
        dynamic.vehicle.setWheelSteering(i, 0)
        dynamic.vehicle.setWheelEngineForce(i, 0)
        dynamic.vehicle.setWheelBrake(i, 0)
      }
    }

    const arcade = this.arcadeVehicles.get(id.value)
    if (arcade) {
      arcade.currentSpeed = 0
      arcade.jumpCooldown = 0
      const velocity = this.physicsSystem.getBodyLinearVelocity(id)
      if (velocity) {
        this.physicsSystem.setBodyLinearVelocity(id, [0, velocity[1], 0])
      }
      if (this.physicsSystem.getBodyAngularVelocity(id)) {
        this.physicsSystem.setBodyAngularVelocity(id, [0, 0, 0])
      }
    }

    const character = this.characters.get(id.value)
    if (character) {
      character.velocityXZ = [0, 0, 0]
      character.jumpBuffer = 0
      character.jumpCooldown = 0
      character.grounded = false
    }

    const revolute = this.revoluteVehicles.get(id.value)
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (revolute && physicsWorld) {
      revolute.steerAngle = 0
      for (const wheel of revolute.wheels) {
        if (wheel.isSteered) {
          physicsWorld.setRevoluteMotorPosition(
            wheel.joint,
            0,
            revolute.steerStiffness,
            revolute.steerDamping,
          )
        }
        if (wheel.isDriven) {
          physicsWorld.setRevoluteMotorVelocity(wheel.joint, 0, 0)
        }
      }
    }
  }

  /** @deprecated use resetControllerState */
  resetVehicleState(id: EntityId): void {
    this.resetControllerState(id)
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

    this.resetDisabledControllerTransitions(world)

    for (const [entityIdValue, tracked] of this.customRaycast) {
      const id = { value: entityIdValue } as EntityId
      const controllerData = world.getComponent(id, PhysicsControllerComponent)
      if (
        !controllerData ||
        controllerData.enabled === false ||
        controllerData.type !== 'custom-raycast'
      ) {
        continue
      }
      const vehicleData = controllerData

      const bodyHandle = this.physicsSystem.getBodyHandle(id)
      if (!bodyHandle) {
        continue
      }

      const input = this.inputs.get(entityIdValue) ?? {}
      const wheelStates = tracked.vehicle.getWheelStates()
      const grounded = wheelStates.some((state) => state.inContact)

      const drive = computeIsaacDriveControlState({
        vehicle: vehicleData,
        input,
      })

      tracked.currentSteer = drive.currentSteer

      const [fl, fr, bl, br] = tracked.wheels
      const physicsSteer = grounded ? ISAAC_RAYCAST_PHYSICS_STEER_SIGN * drive.currentSteer : 0
      const engineForce = grounded ? drive.engineForce : 0
      tracked.vehicle.setSteering(fl, physicsSteer)
      tracked.vehicle.setSteering(fr, physicsSteer)
      tracked.vehicle.applyEngineForce(bl, engineForce)
      tracked.vehicle.applyEngineForce(br, engineForce)

      for (const wheel of tracked.wheels) {
        tracked.vehicle.setBrake(wheel, drive.brake)
      }
    }

    updateDynamicRaycast(world, this.dynamicRaycast, this.inputs, dt)
    ensureArcadeTracked(world, this.arcadeVehicles)
    updateArcadeVehicle(
      world,
      physicsWorld,
      this.physicsSystem,
      this.arcadeVehicles,
      this.inputs,
      dt,
    )
    updateCharacter(world, this.characters, this.inputs, dt)
    updateCustomSpring(world, physicsWorld, this.physicsSystem)
    updateRevoluteVehicle(
      world,
      physicsWorld,
      this.physicsSystem,
      this.revoluteVehicles,
      this.inputs,
      dt,
    )
  }

  bootstrap(world: IWorld): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (!physicsWorld) {
      return
    }

    for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
      const controllerData = world.getComponent(id, PhysicsControllerComponent)
      if (!controllerData || controllerData.type !== 'custom-raycast') {
        continue
      }
      const vehicleData = controllerData

      const bodyHandle = this.physicsSystem.getBodyHandle(id)
      if (!bodyHandle) {
        continue
      }

      const raycastVehicle = physicsWorld.createRaycastVehicle(bodyHandle)
      const configs = raycastWheelConfigs(vehicleData)
      const wheels = configs.map((config) => raycastVehicle.addWheel(config))
      if (wheels.length !== 4) {
        continue
      }

      this.customRaycast.set(id.value, {
        vehicle: raycastVehicle,
        wheels: [wheels[0]!, wheels[1]!, wheels[2]!, wheels[3]!],
        currentSteer: 0,
      })
    }

    bootstrapDynamicRaycast(world, physicsWorld, this.physicsSystem, this.dynamicRaycast)
    bootstrapCharacter(world, physicsWorld, this.physicsSystem, this.characters)
    bootstrapRevoluteVehicle(world, physicsWorld, this.physicsSystem, this.revoluteVehicles)
    ensureArcadeTracked(world, this.arcadeVehicles)
  }

  private resetDisabledControllerTransitions(world: IWorld): void {
    const trackedControllers = [
      ['custom-raycast', this.customRaycast],
      ['dynamic-raycast', this.dynamicRaycast],
      ['arcade-vehicle', this.arcadeVehicles],
      ['kinematic-character', this.characters],
      ['revolute-joint-vehicle', this.revoluteVehicles],
    ] as const

    for (const [type, tracked] of trackedControllers) {
      for (const entityIdValue of tracked.keys()) {
        const id = { value: entityIdValue } as EntityId
        const controller = world.getComponent(id, PhysicsControllerComponent)
        const enabled = controller?.type === type && controller.enabled !== false
        if (enabled) {
          this.disabledControllers.delete(entityIdValue)
        } else if (!this.disabledControllers.has(entityIdValue)) {
          this.resetControllerState(id)
          this.disabledControllers.add(entityIdValue)
        }
      }
    }
  }

  dispose(): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (physicsWorld) {
      disposeRevoluteVehicle(physicsWorld, this.revoluteVehicles)
    }
    this.customRaycast.clear()
    this.dynamicRaycast.clear()
    this.arcadeVehicles.clear()
    this.characters.clear()
    this.disabledControllers.clear()
    this.inputs.clear()
    this.bootstrapped = false
  }
}

/** @deprecated use PhysicsControllerSystem */
export const VehicleControllerSystem = PhysicsControllerSystem
