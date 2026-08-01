import {
  TransformComponent,
  type EngineScheduler,
  type EntityId,
  type ISystem,
  type IWorld,
} from '@haku/core'
import {
  InputManager,
  lookAtQuaternion,
  type PhysicsContactSystem,
  type PhysicsWorldSystem,
} from '@haku/engine'
import type { EntityPool } from '@haku/pool'
import type { Vec3 } from '@haku/schema'
import type { UIService } from '@haku/ui'
import { applyBallControlStep } from './ball-controller.js'
import { stepFollowCamera, type FollowCameraPose } from './follow-camera.js'
import { LandingTracker } from './landing-tracker.js'
import { BOUNCE_RUN_UI_IDS } from './ui-document.js'

export class BounceRunInputSystem implements ISystem {
  readonly phase = 'FrameInput' as const
  readonly localOrder = 0

  lateralInput = 0

  constructor(
    private readonly input: InputManager,
    private readonly onPause: () => void,
    private readonly onRestart: () => void,
  ) {}

  update(): void {
    const actions = this.input.getActionMap()
    this.lateralInput = typeof actions.lateral === 'number' ? actions.lateral : 0
    if (actions.pause === true) this.onPause()
    if (actions.restart === true) this.onRestart()
    this.input.endFrame()
  }
}

export class BounceRunControlSystem implements ISystem {
  readonly phase = 'FixedPrePhysics' as const
  readonly localOrder = -20

  private pendingLanding = false
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
        forwardSpeed: 6.5,
        lateralSpeed: 4.25,
        lateralResponsiveness: 10,
        bounceHeight: 2.6,
        gravity: 18,
      }),
    )
    this.pendingLanding = false
  }

  queueLanding(): void {
    this.pendingLanding = true
  }

  verticalVelocityBeforeStep(): number {
    return this.downwardVelocity
  }

  reset(): void {
    this.pendingLanding = false
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
  ) {
    this.tracker = new LandingTracker(ball.value)
  }

  update(): void {
    const landing = this.tracker.consume(
      this.scheduler.tickNumber,
      this.contacts.peekCollisionEvents(),
      this.control.verticalVelocityBeforeStep(),
    )
    if (landing) this.control.queueLanding()
  }

  reset(): void {
    this.tracker.reset()
  }
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
