import type { EntityId } from '@haku/core'
import type { IPhysicsWorld, PhysicsBodyHandle } from '@haku/physics'
import type { ControllerPlugin, ControllerRuntimeContext } from '../registry.js'
import {
  bootstrapRevoluteVehicle,
  disposeRevoluteVehicle,
  resetRevoluteVehicle,
  updateRevoluteVehicle,
  type TrackedRevoluteVehicle,
} from '../../systems/physics-controller-runtime.js'

/** Isaac Mason `revolute-joint-vehicle` — revolute joints + motor drive. */
export class RevoluteJointVehiclePlugin implements ControllerPlugin {
  readonly type = 'revolute-joint-vehicle'
  private readonly tracked = new Map<string, TrackedRevoluteVehicle>()

  bootstrap(ctx: ControllerRuntimeContext): void {
    bootstrapRevoluteVehicle(ctx.world, ctx.physicsWorld, ctx.physicsSystem, this.tracked)
  }

  update(ctx: ControllerRuntimeContext, dt: number): void {
    updateRevoluteVehicle(
      ctx.world,
      ctx.physicsWorld,
      ctx.physicsSystem,
      this.tracked,
      ctx.inputs,
      dt,
    )
  }

  resetEntity(ctx: ControllerRuntimeContext, id: EntityId): void {
    // Re-seat every wheel/hub/knuckle body relative to the freshly-reset chassis and zero all
    // velocities/motors — otherwise the runtime-only sub-bodies keep their momentum and the joints
    // spin the car on the spot instead of standing still.
    resetRevoluteVehicle(ctx.world, ctx.physicsWorld, ctx.physicsSystem, this.tracked, id)
  }

  trackedIds(): Iterable<string> {
    return this.tracked.keys()
  }

  /** Runtime wheel rigid-body handles in spawn order, for visual sync. */
  getWheelBodies(id: EntityId): PhysicsBodyHandle[] | undefined {
    return this.tracked.get(id.value)?.wheels.map((wheel) => wheel.wheelBody)
  }

  dispose(physicsWorld: IPhysicsWorld | null): void {
    if (physicsWorld) {
      disposeRevoluteVehicle(physicsWorld, this.tracked)
    } else {
      this.tracked.clear()
    }
  }
}
