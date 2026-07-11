import type { EntityId, IWorld, ISystem } from '@haku/core'
import { entityId, TransformComponent } from '@haku/core'
import type { IPhysicsBackend, IPhysicsWorld, PhysicsBodyHandle, RigidBodyType } from '@haku/physics'
import { PhysicsWorld } from '@haku/physics'

export interface PhysicsWorldSystemOptions {
  /** Fixed simulation step in seconds. Default: 1/60 (60 Hz). */
  fixedTimestep?: number
  /** Max physics substeps per frame to avoid spiral-of-death. Default: 3. */
  maxSubsteps?: number
}

interface TrackedBody {
  handle: PhysicsBodyHandle
  type: RigidBodyType
}

const DEFAULT_FIXED_TIMESTEP = 1 / 60
const DEFAULT_MAX_SUBSTEPS = 3

/**
 * Steps {@link IPhysicsWorld} at a fixed rate and writes dynamic body transforms
 * back to entity {@link TransformComponent} data.
 */
export class PhysicsWorldSystem implements ISystem {
  readonly order = 50

  private readonly fixedTimestep: number
  private readonly maxSubsteps: number
  private physicsWorld: PhysicsWorld | null = null
  private backend: IPhysicsBackend | null = null
  private accumulator = 0
  private readonly trackedBodies = new Map<string, TrackedBody>()

  constructor(options: PhysicsWorldSystemOptions = {}) {
    this.fixedTimestep = options.fixedTimestep ?? DEFAULT_FIXED_TIMESTEP
    this.maxSubsteps = options.maxSubsteps ?? DEFAULT_MAX_SUBSTEPS
  }

  /** Initialize and attach a physics backend. Replaces any previous backend. */
  setBackend(backend: IPhysicsBackend): void {
    this.disposeBackend()
    backend.init()
    this.backend = backend
    this.physicsWorld = new PhysicsWorld(backend)
    this.accumulator = 0
  }

  /** Release backend resources and clear tracked bodies. */
  dispose(): void {
    this.disposeBackend()
    this.trackedBodies.clear()
    this.accumulator = 0
  }

  getPhysicsWorld(): IPhysicsWorld | null {
    return this.physicsWorld
  }

  /**
   * Track an entity's physics body for transform sync.
   * Static bodies are ignored — they do not drive entity transforms.
   */
  registerBody(
    id: EntityId,
    handle: PhysicsBodyHandle,
    type: RigidBodyType,
    world?: IWorld,
  ): void {
    if (type === 'static') {
      return
    }

    if (world && this.physicsWorld) {
      const transform = world.getComponent(id, TransformComponent)
      if (transform) {
        this.physicsWorld.setBodyTransform(handle, {
          position: transform.position,
          rotation: transform.rotation,
        })
      }
    }

    this.trackedBodies.set(id.value, { handle, type })
  }

  unregisterBody(id: EntityId): void {
    this.trackedBodies.delete(id.value)
  }

  update(world: IWorld, dt: number): void {
    if (!this.physicsWorld || this.trackedBodies.size === 0) {
      return
    }

    this.accumulator += dt
    if (this.accumulator > this.fixedTimestep * this.maxSubsteps) {
      this.accumulator = this.fixedTimestep * this.maxSubsteps
    }

    let substeps = 0
    while (this.accumulator >= this.fixedTimestep - 1e-9 && substeps < this.maxSubsteps) {
      this.physicsWorld.step(this.fixedTimestep)
      this.accumulator -= this.fixedTimestep
      substeps += 1
    }

    this.syncDynamicTransforms(world)
  }

  private syncDynamicTransforms(world: IWorld): void {
    if (!this.physicsWorld) {
      return
    }

    for (const [entityIdValue, { handle, type }] of this.trackedBodies) {
      if (type !== 'dynamic') {
        continue
      }

      const id = entityId(entityIdValue)
      const transform = world.getComponent(id, TransformComponent)
      if (!transform) {
        continue
      }

      const bodyTransform = this.physicsWorld.getBodyTransform(handle)
      world.addComponent(id, TransformComponent, {
        position: [...bodyTransform.position],
        rotation: [...bodyTransform.rotation],
        scale: [...transform.scale],
      })
    }
  }

  private disposeBackend(): void {
    if (this.backend) {
      this.backend.dispose()
      this.backend = null
    }
    this.physicsWorld = null
  }
}
