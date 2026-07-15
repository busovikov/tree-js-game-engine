import type { EntityId } from '@haku/core'
import type { ControllerPlugin, ControllerRuntimeContext } from '../registry.js'
import {
  bootstrapCharacter,
  updateCharacter,
  type TrackedCharacter,
} from '../../systems/physics-controller-runtime.js'

/** Godot-style CharacterBody3D — shares kinematic character runtime with tier-3 step config. */
export class CharacterBodyPlugin implements ControllerPlugin {
  readonly type = 'character-body'
  private readonly tracked = new Map<string, TrackedCharacter>()

  bootstrap(ctx: ControllerRuntimeContext): void {
    bootstrapCharacter(ctx.world, ctx.physicsWorld, ctx.physicsSystem, this.tracked, 'character-body')
  }

  update(ctx: ControllerRuntimeContext, dt: number): void {
    updateCharacter(ctx.world, this.tracked, ctx.inputs, dt, 'character-body')
  }

  resetEntity(_ctx: ControllerRuntimeContext, id: EntityId): void {
    const character = this.tracked.get(id.value)
    if (!character) {
      return
    }
    character.velocityXZ = [0, 0, 0]
    character.jumpBuffer = 0
    character.jumpCooldown = 0
    character.grounded = false
  }

  trackedIds(): Iterable<string> {
    return this.tracked.keys()
  }

  dispose(): void {
    this.tracked.clear()
  }
}
