import type { EntityId } from '@haku/core'
import type { IDynamicRaycastVehicle } from '@haku/physics'
import type { ControllerPlugin, ControllerRuntimeContext } from '../registry.js'
import {
  bootstrapDynamicRaycast,
  updateDynamicRaycast,
  type TrackedDynamicRaycast,
} from '../../systems/physics-controller-runtime.js'

/** Rapier `DynamicRaycastVehicleController` controller (Isaac sketch + Three.js example). */
export class DynamicRaycastPlugin implements ControllerPlugin {
  readonly type = 'dynamic-raycast'
  private readonly tracked = new Map<string, TrackedDynamicRaycast>()

  bootstrap(ctx: ControllerRuntimeContext): void {
    bootstrapDynamicRaycast(ctx.world, ctx.physicsWorld, ctx.physicsSystem, this.tracked)
  }

  update(ctx: ControllerRuntimeContext, dt: number): void {
    updateDynamicRaycast(ctx.world, this.tracked, ctx.inputs, dt)
  }

  resetEntity(_ctx: ControllerRuntimeContext, id: EntityId): void {
    const dynamic = this.tracked.get(id.value)
    if (!dynamic) {
      return
    }
    dynamic.accelerateForce = 0
    dynamic.brakeForceValue = 0
    dynamic.currentSteering = 0
    for (let i = 0; i < dynamic.wheelCount; i++) {
      dynamic.vehicle.setWheelSteering(i, 0)
      dynamic.vehicle.setWheelEngineForce(i, 0)
      dynamic.vehicle.setWheelBrake(i, 0)
    }
  }

  trackedIds(): Iterable<string> {
    return this.tracked.keys()
  }

  dispose(): void {
    this.tracked.clear()
  }

  getVehicle(id: EntityId): IDynamicRaycastVehicle | undefined {
    return this.tracked.get(id.value)?.vehicle
  }

  getTracked(id: EntityId): TrackedDynamicRaycast | undefined {
    return this.tracked.get(id.value)
  }
}
