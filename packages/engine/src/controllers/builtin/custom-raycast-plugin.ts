import type { EntityId } from '@haku/core'
import { PhysicsControllerComponent, TransformComponent } from '@haku/core'
import type { CustomRaycastController } from '@haku/schema'
import { controllerWheelLocalPositions } from '@haku/schema'
import type { IRaycastVehicle, PhysicsWheelHandle, WheelConfig } from '@haku/physics'
import type { ControllerInput, ControllerPlugin, ControllerRuntimeContext } from '../registry.js'
import { ISAAC_RAYCAST_PHYSICS_STEER_SIGN } from '../../vehicle-model-fit.js'

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

/** Build four {@link WheelConfig} entries from a custom-raycast controller. */
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
 * Isaac Mason `custom-raycast-vehicle` — bespoke raycast vehicle (direct force, instant steer,
 * constant brake). Rear-wheel drive with grounded gating on steer/engine force.
 */
export class CustomRaycastPlugin implements ControllerPlugin {
  readonly type = 'custom-raycast'
  private readonly tracked = new Map<string, TrackedCustomRaycast>()

  bootstrap(ctx: ControllerRuntimeContext): void {
    for (const id of ctx.world.query(PhysicsControllerComponent, TransformComponent)) {
      const controllerData = ctx.world.getComponent(id, PhysicsControllerComponent)
      if (!controllerData || controllerData.type !== 'custom-raycast') {
        continue
      }
      const bodyHandle = ctx.physicsSystem.getBodyHandle(id)
      if (!bodyHandle) {
        continue
      }

      const raycastVehicle = ctx.physicsWorld.createRaycastVehicle(bodyHandle)
      const configs = raycastWheelConfigs(controllerData)
      const wheels = configs.map((config) => raycastVehicle.addWheel(config))
      if (wheels.length !== 4) {
        continue
      }

      this.tracked.set(id.value, {
        vehicle: raycastVehicle,
        wheels: [wheels[0]!, wheels[1]!, wheels[2]!, wheels[3]!],
        currentSteer: 0,
      })
    }
  }

  update(ctx: ControllerRuntimeContext, _dt: number): void {
    for (const [entityIdValue, tracked] of this.tracked) {
      const id = { value: entityIdValue } as EntityId
      const controllerData = ctx.world.getComponent(id, PhysicsControllerComponent)
      if (
        !controllerData ||
        controllerData.enabled === false ||
        controllerData.type !== 'custom-raycast'
      ) {
        continue
      }

      const bodyHandle = ctx.physicsSystem.getBodyHandle(id)
      if (!bodyHandle) {
        continue
      }

      const input = ctx.inputs.get(entityIdValue) ?? {}
      const wheelStates = tracked.vehicle.getWheelStates()
      const grounded = wheelStates.some((state) => state.inContact)

      const drive = computeIsaacDriveControlState({ vehicle: controllerData, input })
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
  }

  resetEntity(_ctx: ControllerRuntimeContext, id: EntityId): void {
    const custom = this.tracked.get(id.value)
    if (!custom) {
      return
    }
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

  trackedIds(): Iterable<string> {
    return this.tracked.keys()
  }

  dispose(): void {
    this.tracked.clear()
  }

  getVehicle(id: EntityId): IRaycastVehicle | undefined {
    return this.tracked.get(id.value)?.vehicle
  }

  getCurrentSteer(id: EntityId): number | undefined {
    return this.tracked.get(id.value)?.currentSteer
  }
}
