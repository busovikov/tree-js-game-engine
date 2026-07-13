import type { EntityId, IWorld, ISystem } from '@haku/core'
import { PhysicsControllerComponent } from '@haku/core'
import type { IRaycastVehicle, IDynamicRaycastVehicle, IPhysicsWorld } from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'
import type { TrackedDynamicRaycast } from './physics-controller-runtime.js'
import {
  ControllerRegistry,
  type ControllerInput,
  type ControllerRuntimeContext,
} from '../controllers/registry.js'
import {
  CustomRaycastPlugin,
  raycastWheelConfigs,
} from '../controllers/builtin/custom-raycast-plugin.js'
import { DynamicRaycastPlugin } from '../controllers/builtin/dynamic-raycast-plugin.js'
import { ArcadeVehiclePlugin } from '../controllers/builtin/arcade-vehicle-plugin.js'
import { KinematicCharacterPlugin } from '../controllers/builtin/kinematic-character-plugin.js'
import { RevoluteJointVehiclePlugin } from '../controllers/builtin/revolute-joint-vehicle-plugin.js'

export type { ControllerInput, ControllerRuntimeContext, ControllerPlugin } from '../controllers/registry.js'
export { ControllerRegistry } from '../controllers/registry.js'
export {
  raycastWheelConfigs,
  computeIsaacDriveControlState,
  type DriveControlState,
  type DriveControlContext,
} from '../controllers/builtin/custom-raycast-plugin.js'

/** @deprecated use ControllerInput */
export type VehicleInput = ControllerInput

/** @deprecated use raycastWheelConfigs */
export const vehicleWheelConfigs = raycastWheelConfigs

/**
 * Drives entities with a {@link PhysicsControllerComponent} by delegating to registered
 * {@link ControllerPlugin}s. Each controller kind (custom-raycast, dynamic-raycast, arcade,
 * kinematic-character, revolute-joint) is a plugin that owns its runtime state; this system
 * only orchestrates bootstrap/update/reset/dispose and the shared disabled-transition sweep.
 */
export class PhysicsControllerSystem implements ISystem {
  readonly order = 48

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly inputs = new Map<string, ControllerInput>()
  private readonly registry = new ControllerRegistry()
  private readonly customRaycast = new CustomRaycastPlugin()
  private readonly dynamicRaycast = new DynamicRaycastPlugin()
  private readonly disabledControllers = new Set<string>()
  private bootstrapped = false

  constructor(physicsSystem: PhysicsWorldSystem) {
    this.physicsSystem = physicsSystem
    // Registration order defines bootstrap/update ordering — keep it stable.
    this.registry.register(this.customRaycast)
    this.registry.register(this.dynamicRaycast)
    this.registry.register(new ArcadeVehiclePlugin())
    this.registry.register(new KinematicCharacterPlugin())
    this.registry.register(new RevoluteJointVehiclePlugin())
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
    return this.customRaycast.getCurrentSteer(id)
  }

  getRaycastVehicle(id: EntityId): IRaycastVehicle | undefined {
    return this.customRaycast.getVehicle(id)
  }

  getDynamicRaycastVehicle(id: EntityId): IDynamicRaycastVehicle | undefined {
    return this.dynamicRaycast.getVehicle(id)
  }

  getTrackedDynamicRaycast(id: EntityId): TrackedDynamicRaycast | undefined {
    return this.dynamicRaycast.getTracked(id)
  }

  private context(world: IWorld, physicsWorld: IPhysicsWorld): ControllerRuntimeContext {
    return { world, physicsWorld, physicsSystem: this.physicsSystem, inputs: this.inputs }
  }

  private resetTrackedEntity(ctx: ControllerRuntimeContext, id: EntityId): void {
    this.clearControllerInput(id)
    for (const plugin of this.registry.all()) {
      plugin.resetEntity(ctx, id)
    }
  }

  resetControllerState(world: IWorld, id: EntityId): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (!physicsWorld) {
      this.clearControllerInput(id)
      return
    }
    this.resetTrackedEntity(this.context(world, physicsWorld), id)
  }

  /** @deprecated use resetControllerState */
  resetVehicleState(world: IWorld, id: EntityId): void {
    this.resetControllerState(world, id)
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

    const ctx = this.context(world, physicsWorld)
    this.resetDisabledControllerTransitions(ctx)

    for (const plugin of this.registry.all()) {
      plugin.update(ctx, dt)
    }
  }

  bootstrap(world: IWorld): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (!physicsWorld) {
      return
    }
    const ctx = this.context(world, physicsWorld)
    for (const plugin of this.registry.all()) {
      plugin.bootstrap(ctx)
    }
  }

  private resetDisabledControllerTransitions(ctx: ControllerRuntimeContext): void {
    for (const plugin of this.registry.all()) {
      for (const entityIdValue of plugin.trackedIds()) {
        const id = { value: entityIdValue } as EntityId
        const controller = ctx.world.getComponent(id, PhysicsControllerComponent)
        const enabled = controller?.type === plugin.type && controller.enabled !== false
        if (enabled) {
          this.disabledControllers.delete(entityIdValue)
        } else if (!this.disabledControllers.has(entityIdValue)) {
          this.resetTrackedEntity(ctx, id)
          this.disabledControllers.add(entityIdValue)
        }
      }
    }
  }

  dispose(): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    for (const plugin of this.registry.all()) {
      plugin.dispose(physicsWorld)
    }
    this.disabledControllers.clear()
    this.inputs.clear()
    this.bootstrapped = false
  }
}

/** @deprecated use PhysicsControllerSystem */
export const VehicleControllerSystem = PhysicsControllerSystem
