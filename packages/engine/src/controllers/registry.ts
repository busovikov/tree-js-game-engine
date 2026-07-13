import type { EntityId, IWorld } from '@haku/core'
import type { IPhysicsWorld } from '@haku/physics'
import type { PhysicsWorldSystem } from '../systems/physics-world-system.js'

/** Programmatic drive input consumed by controller plugins (throttle/steer/jump/…). */
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

/**
 * Narrow runtime surface handed to controller plugins. Exposes the ECS world, the physics
 * world/system primitives, and per-entity input — everything a plugin needs without reaching
 * into {@link PhysicsControllerSystem} internals.
 */
export interface ControllerRuntimeContext {
  readonly world: IWorld
  readonly physicsWorld: IPhysicsWorld
  readonly physicsSystem: PhysicsWorldSystem
  /** Per-entity drive input, keyed by `EntityId.value`. Owned by {@link PhysicsControllerSystem}. */
  readonly inputs: Map<string, ControllerInput>
}

/**
 * A physics controller kind, registered by type id. Each plugin owns its own per-entity
 * runtime state and drives bootstrap/update/reset/dispose against a {@link ControllerRuntimeContext}.
 * This replaces the hardcoded per-type switch in {@link PhysicsControllerSystem}.
 */
export interface ControllerPlugin {
  /** Discriminated `PhysicsController.type` this plugin handles. */
  readonly type: string
  /** Create runtime state for matching entities on play-mode entry. */
  bootstrap(ctx: ControllerRuntimeContext): void
  /** Advance one frame — apply input to physics. */
  update(ctx: ControllerRuntimeContext, dt: number): void
  /** Reset a single entity's runtime state (respawn / disable / type-change). */
  resetEntity(ctx: ControllerRuntimeContext, id: EntityId): void
  /** Entity ids currently tracked — used for the shared disabled-transition sweep. */
  trackedIds(): Iterable<string>
  /**
   * Release runtime resources (wheel bodies, joints) and clear tracked state. `physicsWorld` is
   * null when the world is already gone — plugins that hold physics resources must clear their
   * tracked state without touching it.
   */
  dispose(physicsWorld: IPhysicsWorld | null): void
}

/** Registry of {@link ControllerPlugin}s keyed by controller type. */
export class ControllerRegistry {
  private readonly plugins = new Map<string, ControllerPlugin>()

  register(plugin: ControllerPlugin): void {
    this.plugins.set(plugin.type, plugin)
  }

  get(type: string): ControllerPlugin | undefined {
    return this.plugins.get(type)
  }

  all(): readonly ControllerPlugin[] {
    return [...this.plugins.values()]
  }
}
