import type { EntityId } from '@haku/core'
import type { Vec3 } from '@haku/physics'
import type { ControllerPlugin, ControllerRuntimeContext } from '../registry.js'
import {
  ensureArcadeTracked,
  updateArcadeVehicle,
  type TrackedArcadeVehicle,
} from '../../systems/physics-controller-runtime.js'

/** Isaac Mason `arcade-vehicle-controller` — impulse arcade drive + drift. */
export class ArcadeVehiclePlugin implements ControllerPlugin {
  readonly type = 'arcade-vehicle'
  private readonly tracked = new Map<string, TrackedArcadeVehicle>()

  bootstrap(ctx: ControllerRuntimeContext): void {
    ensureArcadeTracked(ctx.world, this.tracked)
  }

  update(ctx: ControllerRuntimeContext, dt: number): void {
    ensureArcadeTracked(ctx.world, this.tracked)
    updateArcadeVehicle(
      ctx.world,
      ctx.physicsWorld,
      ctx.physicsSystem,
      this.tracked,
      ctx.inputs,
      dt,
    )
  }

  resetEntity(ctx: ControllerRuntimeContext, id: EntityId): void {
    const arcade = this.tracked.get(id.value)
    if (!arcade) {
      return
    }
    arcade.currentSpeed = 0
    arcade.jumpCooldown = 0
    const velocity = ctx.physicsSystem.getBodyLinearVelocity(id)
    if (velocity) {
      ctx.physicsSystem.setBodyLinearVelocity(id, [0, velocity[1], 0] as Vec3)
    }
    if (ctx.physicsSystem.getBodyAngularVelocity(id)) {
      ctx.physicsSystem.setBodyAngularVelocity(id, [0, 0, 0])
    }
  }

  trackedIds(): Iterable<string> {
    return this.tracked.keys()
  }

  dispose(): void {
    this.tracked.clear()
  }
}
