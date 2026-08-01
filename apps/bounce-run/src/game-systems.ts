import {
  TransformComponent,
  entityId,
  type EngineScheduler,
  type EntityId,
  type ISystem,
  type IWorld,
} from '@haku/core'
import {
  InputManager,
  lookAtQuaternion,
  type PhysicsCollisionEvent,
  type PhysicsContactSystem,
  type PhysicsWorldSystem,
} from '@haku/engine'
import type { EntityPool } from '@haku/pool'
import type { Vec3 } from '@haku/schema'
import type { UIService } from '@haku/ui'
import { applyBallControlStep } from './ball-controller.js'
import { BOUNCE_RUN_PHYSICS } from './bounce-run-physics.js'
import { stepFollowCamera, type FollowCameraPose } from './follow-camera.js'
import type { PoolBackedBounceRunRoute } from './infinite-route.js'
import { LandingTracker } from './landing-tracker.js'
import { BOUNCE_RUN_UI_IDS } from './ui-document.js'

export class BounceRunInputSystem implements ISystem {
  readonly phase = 'FrameInput' as const
  readonly localOrder = 0

  lateralInput = 0
  private lateralAction: number | null = null

  constructor(
    private readonly input: InputManager,
    private readonly onPause: () => void,
    private readonly onRestart: () => void,
  ) {}

  update(): void {
    const actions = this.input.getActionMap()
    this.lateralInput =
      this.lateralAction ?? (typeof actions.lateral === 'number' ? actions.lateral : 0)
    if (actions.pause === true) this.onPause()
    if (actions.restart === true) this.onRestart()
    this.input.endFrame()
  }

  /** Public action port used by deterministic replay and dev-only browser QA. */
  setLateralAction(value: number | null): void {
    if (value !== null && (!Number.isFinite(value) || value < -1 || value > 1)) {
      throw new Error('Bounce Run lateral action must be null or a finite value from -1 to 1')
    }
    this.lateralAction = value
  }
}

export class BounceRunControlSystem implements ISystem {
  readonly phase = 'FixedPrePhysics' as const
  readonly localOrder = -20

  private pendingLanding = false
  private pendingBounceHeight: number = BOUNCE_RUN_PHYSICS.bounceHeight
  private downwardVelocity = 0

  constructor(
    private readonly ball: EntityId,
    private readonly physics: PhysicsWorldSystem,
    private readonly input: BounceRunInputSystem,
  ) {}

  update(_world: IWorld, dt: number): void {
    const velocity = this.physics.getBodyLinearVelocity(this.ball)
    if (!velocity) return
    this.downwardVelocity = velocity[1]
    this.physics.setBodyLinearVelocity(
      this.ball,
      applyBallControlStep({
        velocity,
        lateralInput: this.input.lateralInput,
        landed: this.pendingLanding,
        dt,
        forwardSpeed: BOUNCE_RUN_PHYSICS.forwardSpeed,
        lateralSpeed: BOUNCE_RUN_PHYSICS.lateralSpeed,
        lateralResponsiveness: BOUNCE_RUN_PHYSICS.lateralResponsiveness,
        bounceHeight: this.pendingBounceHeight,
        gravity: BOUNCE_RUN_PHYSICS.gravity,
      }),
    )
    this.pendingLanding = false
    this.pendingBounceHeight = BOUNCE_RUN_PHYSICS.bounceHeight
  }

  queueLanding(bounceHeight: number = BOUNCE_RUN_PHYSICS.bounceHeight): void {
    if (!Number.isFinite(bounceHeight) || bounceHeight <= 0) {
      throw new Error('Bounce height must be a finite positive number')
    }
    this.pendingLanding = true
    this.pendingBounceHeight = bounceHeight
  }

  verticalVelocityBeforeStep(): number {
    return this.downwardVelocity
  }

  reset(): void {
    this.pendingLanding = false
    this.pendingBounceHeight = BOUNCE_RUN_PHYSICS.bounceHeight
    this.downwardVelocity = 0
  }
}

export class BounceRunLandingSystem implements ISystem {
  readonly phase = 'PostPhysics' as const
  readonly localOrder = 10

  private readonly tracker: LandingTracker

  constructor(
    ball: EntityId,
    private readonly contacts: PhysicsContactSystem,
    private readonly control: BounceRunControlSystem,
    private readonly scheduler: EngineScheduler,
    private readonly route?: PoolBackedBounceRunRoute,
  ) {
    this.tracker = new LandingTracker(ball.value)
  }

  update(): void {
    const landing = this.tracker.consume(
      this.scheduler.tickNumber,
      this.contacts.peekCollisionEvents(),
      this.control.verticalVelocityBeforeStep(),
    )
    if (landing) {
      const descriptor = this.route?.platformDescriptor(entityId(landing.platformId))
      this.control.queueLanding(descriptor?.behavior.bounceHeight)
    }
  }

  reset(): void {
    this.tracker.reset()
  }
}

interface BounceRunBonusScoreRuntime {
  state(): 'start' | 'active' | 'paused' | 'game-over'
  collectBonus(): boolean
}

type PhysicsContactReader = Pick<PhysicsContactSystem, 'peekCollisionEvents'>

/** Converts public trigger-enter events into one graph-owned score award per pooled bonus lease. */
export class BounceRunBonusCollectionSystem implements ISystem {
  readonly phase = 'FixedGameplay' as const
  readonly localOrder = -5

  constructor(
    private readonly ball: EntityId,
    private readonly contacts: PhysicsContactReader,
    private readonly route: PoolBackedBounceRunRoute,
    private readonly session: BounceRunBonusScoreRuntime,
  ) {}

  update(world: IWorld): void {
    if (this.session.state() !== 'active') return
    for (const event of this.contacts.peekCollisionEvents()) {
      const bonus = this.matchActiveBonus(event)
      if (
        !bonus ||
        !isCurrentSensorOverlap(world, this.ball, bonus.entity, bonus.descriptor.radius)
      ) {
        continue
      }
      const descriptor = this.route.collectBonus(bonus.entity)
      if (descriptor && !this.session.collectBonus()) {
        throw new Error('Active Bounce Run session rejected a collected bonus')
      }
    }
  }

  private matchActiveBonus(event: PhysicsCollisionEvent) {
    if (
      event.kind !== 'trigger' ||
      event.phase !== 'enter' ||
      (event.entityA !== this.ball.value && event.entityB !== this.ball.value)
    ) {
      return null
    }
    const other = event.entityA === this.ball.value ? event.entityB : event.entityA
    return this.route.activeBonuses().find((bonus) => bonus.entity.value === other) ?? null
  }
}

function isCurrentSensorOverlap(
  world: IWorld,
  ball: EntityId,
  bonus: EntityId,
  bonusRadius: number,
): boolean {
  const ballTransform = world.getComponent(ball, TransformComponent)
  const bonusTransform = world.getComponent(bonus, TransformComponent)
  if (!ballTransform || !bonusTransform) return false
  const radius = BOUNCE_RUN_PHYSICS.ballRadius + bonusRadius
  const distanceSquared = ballTransform.position.reduce((sum, value, axis) => {
    const delta = value - bonusTransform.position[axis]!
    return sum + delta * delta
  }, 0)
  return distanceSquared <= radius * radius
}

export class BounceRunFailureSystem implements ISystem {
  readonly phase = 'FixedGameplay' as const
  readonly localOrder = 0

  private failed = false

  constructor(
    private readonly ball: EntityId,
    private readonly physics: PhysicsWorldSystem,
    private readonly onFailure: () => void,
  ) {}

  update(): void {
    if (!this.failed && (this.physics.getBodyTransform(this.ball)?.position[1] ?? 0) < -6) {
      this.failed = true
      this.onFailure()
    }
  }

  reset(): void {
    this.failed = false
  }
}

export class BounceRunRouteSystem implements ISystem {
  readonly phase = 'FixedGameplay' as const
  readonly localOrder = -10

  constructor(
    private readonly ball: EntityId,
    private readonly physics: PhysicsWorldSystem,
    private readonly route: PoolBackedBounceRunRoute,
  ) {}

  update(): void {
    const position = this.physics.getBodyTransform(this.ball)?.position
    if (position) this.route.advanceForPosition(position[2])
  }

  reset(): void {
    this.route.reset()
  }
}

export class BounceRunCameraSystem implements ISystem {
  readonly phase = 'LateUpdate' as const
  readonly localOrder = 0

  private pose: FollowCameraPose | null = null

  constructor(
    private readonly ball: EntityId,
    private readonly camera: EntityId,
    private readonly physics: PhysicsWorldSystem,
  ) {}

  update(world: IWorld, dt: number): void {
    if (dt <= 0) return
    const ballTransform = world.getComponent(this.ball, TransformComponent)
    const cameraTransform = world.getComponent(this.camera, TransformComponent)
    if (!ballTransform || !cameraTransform) return

    const tracked = this.physics.resolvePresentationTransform(this.ball, ballTransform)
    this.pose ??= {
      position: [...cameraTransform.position],
      target: [tracked.position[0], tracked.position[1] + 1, tracked.position[2] + 6],
    }
    this.pose = stepFollowCamera(this.pose, tracked.position, dt)
    world.addComponent(this.camera, TransformComponent, {
      position: [...this.pose.position] as Vec3,
      rotation: lookAtQuaternion([...this.pose.position] as Vec3, [...this.pose.target] as Vec3),
      scale: [...cameraTransform.scale] as Vec3,
    })
  }

  reset(): void {
    this.pose = null
  }
}

export class BounceRunPerformanceSystem implements ISystem {
  readonly phase = 'FrameGameplay' as const
  readonly localOrder = 100

  private elapsed = 0
  private samples = 0

  constructor(
    private readonly ui: UIService,
    private readonly pool: EntityPool,
    private readonly scheduler: EngineScheduler,
  ) {}

  update(world: IWorld, dt: number): void {
    if (dt <= 0) return
    this.elapsed += dt
    this.samples += 1
    if (this.samples < 30) return

    const averageMs = (this.elapsed / this.samples) * 1_000
    const metrics = this.pool.metrics()
    this.ui.setText(
      {
        document: BOUNCE_RUN_UI_IDS.document,
        element: BOUNCE_RUN_UI_IDS.performanceText,
      },
      `${averageMs.toFixed(1)} ms · ${(1_000 / averageMs).toFixed(0)} FPS · ` +
        `${world.getAllEntities().length} entities · pool ${metrics.active}/${metrics.total} · ` +
        `tick ${this.scheduler.tickNumber}`,
    )
    this.elapsed = 0
    this.samples = 0
  }
}
