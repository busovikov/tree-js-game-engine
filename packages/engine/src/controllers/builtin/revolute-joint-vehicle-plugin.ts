import type { EntityId } from '@haku/core'
import type { IPhysicsWorld } from '@haku/physics'
import type { ControllerPlugin, ControllerRuntimeContext } from '../registry.js'
import {
  bootstrapRevoluteVehicle,
  disposeRevoluteVehicle,
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
    const revolute = this.tracked.get(id.value)
    if (!revolute) {
      return
    }
    revolute.steerAngle = 0
    for (const wheel of revolute.wheels) {
      if (wheel.isSteered) {
        ctx.physicsWorld.setRevoluteMotorPosition(
          wheel.joint,
          0,
          revolute.steerStiffness,
          revolute.steerDamping,
        )
      }
      if (wheel.isDriven) {
        ctx.physicsWorld.setRevoluteMotorVelocity(wheel.joint, 0, 0)
      }
    }
  }

  trackedIds(): Iterable<string> {
    return this.tracked.keys()
  }

  dispose(physicsWorld: IPhysicsWorld | null): void {
    if (physicsWorld) {
      disposeRevoluteVehicle(physicsWorld, this.tracked)
    } else {
      this.tracked.clear()
    }
  }
}
