import type { EntityId, IWorld, ISystem } from '@haku/core'
import { entityId, TransformComponent } from '@haku/core'
import type { Transform } from '@haku/schema'
import type {
  IPhysicsBackend,
  IPhysicsWorld,
  PhysicsBodyHandle,
  PhysicsShapeHandle,
  PhysicsTransform,
  RigidBodyType,
  Vec3,
} from '@haku/physics'
import { PhysicsWorld } from '@haku/physics'

export interface PhysicsWorldSystemOptions {
  /** Fixed simulation step in seconds. Default: 1/60 (60 Hz). */
  fixedTimestep?: number
  /** Max physics substeps per frame to avoid spiral-of-death. Default: 3. */
  maxSubsteps?: number
  /** Max render-frame delta admitted to the accumulator. Default: one frame's substep budget. */
  maxFrameDelta?: number
  /** Blend fixed physics poses for presentation. Default: true. */
  presentationInterpolation?: boolean
}

interface TrackedBody {
  handle: PhysicsBodyHandle
  type: RigidBodyType
  shapeHandle?: PhysicsShapeHandle
}

interface PresentationPoseHistory {
  previous: PhysicsTransform
  current: PhysicsTransform
}

const DEFAULT_FIXED_TIMESTEP = 1 / 60
const DEFAULT_MAX_SUBSTEPS = 3

/** Shared bounded catch-up policy for interactive play mode. */
export const PHYSICS_CATCH_UP_POLICY: Readonly<Required<PhysicsWorldSystemOptions>> =
  Object.freeze({
    fixedTimestep: DEFAULT_FIXED_TIMESTEP,
    maxSubsteps: DEFAULT_MAX_SUBSTEPS,
    maxFrameDelta: DEFAULT_FIXED_TIMESTEP * DEFAULT_MAX_SUBSTEPS,
    presentationInterpolation: true,
  })

/** Pure position lerp + normalized shortest-path quaternion interpolation. */
export function interpolatePhysicsPose(
  previous: PhysicsTransform,
  current: PhysicsTransform,
  alpha: number,
): PhysicsTransform {
  const t = Math.max(0, Math.min(1, alpha))
  return {
    position: [
      previous.position[0] + (current.position[0] - previous.position[0]) * t,
      previous.position[1] + (current.position[1] - previous.position[1]) * t,
      previous.position[2] + (current.position[2] - previous.position[2]) * t,
    ],
    rotation: slerpQuaternion(previous.rotation, current.rotation, t),
  }
}

/**
 * Steps {@link IPhysicsWorld} at a fixed rate and writes dynamic body transforms
 * back to entity {@link TransformComponent} data.
 */
export class PhysicsWorldSystem implements ISystem {
  readonly order = 50

  private readonly fixedTimestep: number
  private readonly maxSubsteps: number
  private readonly maxFrameDelta: number
  private readonly presentationInterpolation: boolean
  private physicsWorld: PhysicsWorld | null = null
  private backend: IPhysicsBackend | null = null
  private accumulator = 0
  private readonly trackedBodies = new Map<string, TrackedBody>()
  private readonly presentationPoses = new Map<string, PresentationPoseHistory>()
  private readonly queuedSubstepActions = new Map<string, () => void>()
  private readonly presentationSnapPending = new Set<string>()

  constructor(options: PhysicsWorldSystemOptions = {}) {
    this.fixedTimestep = options.fixedTimestep ?? DEFAULT_FIXED_TIMESTEP
    this.maxSubsteps = options.maxSubsteps ?? DEFAULT_MAX_SUBSTEPS
    this.maxFrameDelta =
      options.maxFrameDelta ?? this.fixedTimestep * this.maxSubsteps
    this.presentationInterpolation = options.presentationInterpolation ?? true
  }

  /** Initialize and attach a physics backend. Replaces any previous backend. */
  setBackend(backend: IPhysicsBackend): void {
    this.disposeBackend()
    backend.init()
    this.backend = backend
    this.physicsWorld = new PhysicsWorld(backend)
    this.accumulator = 0
    this.resetPresentationPoses()
  }

  /** Release backend resources and clear tracked bodies. */
  dispose(): void {
    this.disposeBackend()
    this.trackedBodies.clear()
    this.accumulator = 0
    this.resetPresentationPoses()
  }

  getPhysicsWorld(): IPhysicsWorld | null {
    return this.physicsWorld
  }

  /** Fraction of the next fixed step accumulated for presentation blending. */
  getPresentationAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulator / this.fixedTimestep))
  }

  /**
   * Resolve a render-only transform without mutating simulation components.
   * Untracked, invalidated, and interpolation-disabled entities snap to source.
   */
  resolvePresentationTransform(id: EntityId, source: Transform): Transform {
    const history = this.presentationPoses.get(id.value)
    if (!this.presentationInterpolation || !history) {
      return source
    }
    const pose = interpolatePhysicsPose(
      history.previous,
      history.current,
      this.getPresentationAlpha(),
    )
    return {
      position: [...pose.position],
      rotation: [...pose.rotation],
      scale: [...source.scale],
    }
  }

  /** Invalidate all retained poses after replacing the presented world. */
  resetPresentationPoses(): void {
    this.presentationPoses.clear()
    this.presentationSnapPending.clear()
    for (const entityIdValue of this.trackedBodies.keys()) {
      this.presentationSnapPending.add(entityIdValue)
    }
  }

  /**
   * Queue a keyed action to run before every fixed substep in the next update.
   * Re-queuing the same key replaces the action; all actions expire after the update.
   */
  queueSubstepAction(key: string, action: () => void): void {
    this.queuedSubstepActions.set(key, action)
  }

  /** Sync Rapier scene queries after bulk collider spawn. */
  prepareSceneQueries(): void {
    this.physicsWorld?.prepareSceneQueries()
  }

  /** Returns the physics body handle registered for an entity, if any. */
  getBodyHandle(id: EntityId): PhysicsBodyHandle | null {
    return this.trackedBodies.get(id.value)?.handle ?? null
  }

  /** Returns the primary shape handle registered for an entity, if any. */
  getShapeHandle(id: EntityId): PhysicsShapeHandle | null {
    return this.trackedBodies.get(id.value)?.shapeHandle ?? null
  }

  /** Resolve entity id from a physics body handle (linear scan). */
  findEntityForBody(body: PhysicsBodyHandle): EntityId | null {
    for (const [entityIdValue, tracked] of this.trackedBodies) {
      if (tracked.handle.value === body.value) {
        return entityId(entityIdValue)
      }
    }
    return null
  }

  /** Linear velocity of a registered entity body in m/s, or null if not tracked. */
  getBodyLinearVelocity(id: EntityId): Vec3 | null {
    const handle = this.getBodyHandle(id)
    if (!handle || !this.backend) {
      return null
    }
    return [...this.backend.getBodyLinearVelocity(handle)] as Vec3
  }

  /** Angular velocity of a registered entity body in rad/s, or null if not tracked. */
  getBodyAngularVelocity(id: EntityId): Vec3 | null {
    const handle = this.getBodyHandle(id)
    if (!handle || !this.backend) {
      return null
    }
    return [...this.backend.getBodyAngularVelocity(handle)] as Vec3
  }

  /** Set linear velocity on a registered dynamic body (e.g. jump minimum upward speed). */
  setBodyLinearVelocity(id: EntityId, velocity: Vec3): void {
    const handle = this.getBodyHandle(id)
    if (!handle || !this.backend) {
      return
    }
    this.backend.setBodyLinearVelocity(handle, velocity)
  }

  /** Set angular velocity on a registered dynamic body (e.g. respawn reset). */
  setBodyAngularVelocity(id: EntityId, velocity: Vec3): void {
    const handle = this.getBodyHandle(id)
    if (!handle || !this.backend) {
      return
    }
    this.backend.setBodyAngularVelocity(handle, velocity)
  }

  /** Current physics transform for a registered body, or null if not tracked. */
  getBodyTransform(id: EntityId): PhysicsTransform | null {
    const handle = this.getBodyHandle(id)
    if (!handle || !this.physicsWorld) {
      return null
    }
    return this.physicsWorld.getBodyTransform(handle)
  }

  /**
   * Teleport a dynamic body, zero velocities, and sync entity {@link TransformComponent}.
   */
  resetBodyState(id: EntityId, transform: PhysicsTransform, world?: IWorld): void {
    const handle = this.getBodyHandle(id)
    if (!handle || !this.physicsWorld) {
      return
    }

    this.physicsWorld.setBodyTransform(handle, transform)
    this.setBodyLinearVelocity(id, [0, 0, 0])
    this.setBodyAngularVelocity(id, [0, 0, 0])
    this.presentationPoses.set(id.value, {
      previous: clonePhysicsTransform(transform),
      current: clonePhysicsTransform(transform),
    })

    if (world) {
      const entityTransform = world.getComponent(id, TransformComponent)
      if (entityTransform) {
        world.addComponent(id, TransformComponent, {
          position: [...transform.position] as Vec3,
          rotation: [...transform.rotation],
          scale: [...entityTransform.scale] as Vec3,
        })
      }
    }
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
    shapeHandle?: PhysicsShapeHandle,
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

    this.trackedBodies.set(id.value, { handle, type, shapeHandle })
    if (this.physicsWorld) {
      const pose = this.physicsWorld.getBodyTransform(handle)
      this.presentationPoses.set(id.value, {
        previous: clonePhysicsTransform(pose),
        current: clonePhysicsTransform(pose),
      })
      this.presentationSnapPending.delete(id.value)
    }
  }

  unregisterBody(id: EntityId): void {
    this.trackedBodies.delete(id.value)
    this.presentationPoses.delete(id.value)
    this.presentationSnapPending.delete(id.value)
  }

  update(world: IWorld, dt: number): void {
    if (!this.physicsWorld || this.trackedBodies.size === 0) {
      this.queuedSubstepActions.clear()
      return
    }

    const frameDelta = Number.isNaN(dt) || dt <= 0 ? 0 : Math.min(dt, this.maxFrameDelta)
    this.accumulator += frameDelta
    if (this.accumulator > this.fixedTimestep * this.maxSubsteps) {
      this.accumulator = this.fixedTimestep * this.maxSubsteps
    }

    try {
      let substeps = 0
      while (this.accumulator >= this.fixedTimestep - 1e-9 && substeps < this.maxSubsteps) {
        for (const action of this.queuedSubstepActions.values()) {
          action()
        }
        this.advancePresentationHistoryBeforeStep()
        this.physicsWorld.step(this.fixedTimestep)
        this.capturePresentationPosesAfterStep()
        this.accumulator -= this.fixedTimestep
        substeps += 1
      }
    } finally {
      this.queuedSubstepActions.clear()
    }

    this.syncPhysicsTransforms(world)
  }

  private syncPhysicsTransforms(world: IWorld): void {
    if (!this.physicsWorld) {
      return
    }

    for (const [entityIdValue, { handle, type }] of this.trackedBodies) {
      if (type !== 'dynamic' && type !== 'kinematic') {
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

  private advancePresentationHistoryBeforeStep(): void {
    if (!this.physicsWorld) {
      return
    }
    for (const [entityIdValue, { handle, type }] of this.trackedBodies) {
      if (type !== 'dynamic' && type !== 'kinematic') {
        continue
      }
      const history = this.presentationPoses.get(entityIdValue)
      if (history) {
        history.previous = clonePhysicsTransform(history.current)
      } else {
        const pose = this.physicsWorld.getBodyTransform(handle)
        this.presentationPoses.set(entityIdValue, {
          previous: clonePhysicsTransform(pose),
          current: clonePhysicsTransform(pose),
        })
      }
    }
  }

  private capturePresentationPosesAfterStep(): void {
    if (!this.physicsWorld) {
      return
    }
    for (const [entityIdValue, { handle, type }] of this.trackedBodies) {
      if (type !== 'dynamic' && type !== 'kinematic') {
        continue
      }
      const current = this.physicsWorld.getBodyTransform(handle)
      const history = this.presentationPoses.get(entityIdValue)
      if (!history || this.presentationSnapPending.has(entityIdValue)) {
        this.presentationPoses.set(entityIdValue, {
          previous: clonePhysicsTransform(current),
          current: clonePhysicsTransform(current),
        })
      } else {
        history.current = clonePhysicsTransform(current)
      }
      this.presentationSnapPending.delete(entityIdValue)
    }
  }

  private disposeBackend(): void {
    if (this.backend) {
      this.backend.dispose()
      this.backend = null
    }
    this.physicsWorld = null
    this.queuedSubstepActions.clear()
    this.resetPresentationPoses()
  }
}

function clonePhysicsTransform(transform: PhysicsTransform): PhysicsTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
  }
}

function normalizeQuaternion(rotation: PhysicsTransform['rotation']): PhysicsTransform['rotation'] {
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3])
  if (length <= Number.EPSILON) {
    return [0, 0, 0, 1]
  }
  return [
    rotation[0] / length,
    rotation[1] / length,
    rotation[2] / length,
    rotation[3] / length,
  ]
}

function slerpQuaternion(
  previous: PhysicsTransform['rotation'],
  current: PhysicsTransform['rotation'],
  alpha: number,
): PhysicsTransform['rotation'] {
  const from = normalizeQuaternion(previous)
  let to = normalizeQuaternion(current)
  let dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3]

  if (dot < 0) {
    to = [-to[0], -to[1], -to[2], -to[3]]
    dot = -dot
  }

  if (dot > 0.9995) {
    return normalizeQuaternion([
      from[0] + (to[0] - from[0]) * alpha,
      from[1] + (to[1] - from[1]) * alpha,
      from[2] + (to[2] - from[2]) * alpha,
      from[3] + (to[3] - from[3]) * alpha,
    ])
  }

  const theta = Math.acos(Math.max(-1, Math.min(1, dot)))
  const sinTheta = Math.sin(theta)
  const previousWeight = Math.sin((1 - alpha) * theta) / sinTheta
  const currentWeight = Math.sin(alpha * theta) / sinTheta
  return normalizeQuaternion([
    from[0] * previousWeight + to[0] * currentWeight,
    from[1] * previousWeight + to[1] * currentWeight,
    from[2] * previousWeight + to[2] * currentWeight,
    from[3] * previousWeight + to[3] * currentWeight,
  ])
}
