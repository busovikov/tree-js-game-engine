import type { IWorld, ISystem } from '@haku/core'
import { entityId } from '@haku/core'
import type { PhysicsProjectSettings } from '@haku/schema'
import { defaultPhysicsProjectSettings } from '@haku/schema'
import {
  type PhysicsBodyHandle,
  type PhysicsShapeHandle,
  type RigidBodyType,
} from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'
import { bodyConfigSignature, collectBodyPlans, type BodyPlan } from './physics-body-plan.js'

export {
  colliderToPhysicsShape,
  composeColliderLocalTransform,
  composeColliderTransform,
  controllerChassisColliderFromComponent,
  vehicleChassisCollider,
  resolveColliderDescriptor,
  type ResolvedColliderDescriptor,
} from './physics-collider-utils.js'

/** Shapes the backend can size an explicit mass/inertia for analytically during attachShape. */
const ANALYTIC_MASS_SHAPES = new Set(['box', 'sphere', 'capsule'])

interface TrackedShape {
  entityId: string
  handle: PhysicsShapeHandle
  enabled: boolean
  signature: string
}

interface TrackedBody {
  rootId: string
  body: PhysicsBodyHandle
  type: RigidBodyType
  signature: string
  bodySignature: string
  shapes: TrackedShape[]
  bodyEnabled: boolean
  registered: boolean
}

export interface PhysicsColliderSystemOptions {
  physicsSettings?: PhysicsProjectSettings
}

/**
 * Reconciles ECS collider/rigid-body state with the active physics backend each frame.
 */
export class PhysicsColliderSystem implements ISystem {
  readonly order = 45

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly physicsSettings: PhysicsProjectSettings
  private readonly tracked = new Map<string, TrackedBody>()
  private needsQueryRefresh = false

  constructor(
    physicsSystem: PhysicsWorldSystem,
    options: PhysicsColliderSystemOptions = {},
  ) {
    this.physicsSystem = physicsSystem
    this.physicsSettings = options.physicsSettings ?? defaultPhysicsProjectSettings()
  }

  update(world: IWorld): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (!physicsWorld) {
      return
    }

    const plans = collectBodyPlans(world, this.physicsSettings)
    const planByRoot = new Map(plans.map((plan) => [plan.rootId.value, plan]))

    for (const rootId of [...this.tracked.keys()]) {
      if (!planByRoot.has(rootId)) {
        this.despawnTracked(rootId)
      }
    }

    for (const plan of plans) {
      const existing = this.tracked.get(plan.rootId.value)
      if (!existing) {
        this.spawnPlan(world, plan)
        continue
      }
      if (existing.signature !== plan.signature) {
        if (this.tryHotReloadShapes(plan, existing)) {
          existing.signature = plan.signature
          this.syncEnabled(plan, existing)
          // Replaced/re-enabled shapes changed the collider set, so scene queries must refresh.
          this.needsQueryRefresh = true
          continue
        }
        this.despawnTracked(plan.rootId.value)
        this.spawnPlan(world, plan)
        continue
      }
      this.syncEnabled(plan, existing)
    }

    if (this.needsQueryRefresh) {
      this.physicsSystem.prepareSceneQueries()
      this.needsQueryRefresh = false
    }
  }

  /** One-shot bootstrap for tests that call before first update. */
  bootstrap(world: IWorld): void {
    this.update(world)
  }

  dispose(): void {
    for (const rootId of [...this.tracked.keys()]) {
      this.despawnTracked(rootId)
    }
    this.tracked.clear()
    this.needsQueryRefresh = false
  }

  private spawnPlan(world: IWorld, plan: BodyPlan): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorldForEntity(plan.rootId)
    if (!physicsWorld) {
      return
    }

    const body = physicsWorld.createBody(plan.bodyDescriptor)
    const shapes: TrackedShape[] = []

    for (const shapePlan of plan.shapes) {
      const handle = physicsWorld.attachShape(body, shapePlan.shape)
      shapes.push({
        entityId: shapePlan.entityId.value,
        handle,
        enabled: shapePlan.enabled,
        signature: shapePlanSignature(shapePlan),
      })
      if (!shapePlan.enabled) {
        physicsWorld.setShapeEnabled(handle, false)
      }
    }

    if (!plan.bodyEnabled) {
      physicsWorld.setBodyEnabled(body, false)
    }

    // The backend applies explicit mass analytically for a single primitive shape (box/sphere/
    // capsule) during attachShape. Every other case — multiple shapes, or a single non-primitive
    // shape (cylinder/convexHull/trimesh/…) — needs an explicit finalize, or the authored mass is
    // silently replaced by the density-derived mass.
    const singleShapeIsAnalytic =
      plan.shapes.length === 1 && ANALYTIC_MASS_SHAPES.has(plan.shapes[0]!.shape.type)
    if (
      plan.bodyDescriptor.massMode !== 'autoFromColliders' &&
      plan.bodyDescriptor.mass !== undefined &&
      plan.shapes.length >= 1 &&
      !singleShapeIsAnalytic
    ) {
      physicsWorld.finalizeExplicitMass(body, plan.bodyDescriptor.mass)
    }

    // Track static too so Inspector mid-play / joints can resolve handles for teleport.
    this.physicsSystem.registerBody(
      plan.rootId,
      body,
      plan.bodyType,
      world,
      shapes[0]?.handle,
    )

    this.tracked.set(plan.rootId.value, {
      rootId: plan.rootId.value,
      body,
      type: plan.bodyType,
      signature: plan.signature,
      bodySignature: bodyConfigSignature(plan),
      shapes,
      bodyEnabled: plan.bodyEnabled,
      registered: true,
    })
    this.needsQueryRefresh = true
  }

  private syncEnabled(plan: BodyPlan, tracked: TrackedBody): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorldForEntity(plan.rootId)
    if (!physicsWorld) {
      return
    }

    if (tracked.bodyEnabled !== plan.bodyEnabled) {
      physicsWorld.setBodyEnabled(tracked.body, plan.bodyEnabled)
      tracked.bodyEnabled = plan.bodyEnabled
    }

    for (let i = 0; i < plan.shapes.length; i++) {
      const shapePlan = plan.shapes[i]
      const trackedShape = tracked.shapes[i]
      if (!shapePlan || !trackedShape) {
        continue
      }
      if (trackedShape.enabled !== shapePlan.enabled) {
        physicsWorld.setShapeEnabled(trackedShape.handle, shapePlan.enabled)
        trackedShape.enabled = shapePlan.enabled
      }
    }
  }

  private tryHotReloadShapes(plan: BodyPlan, tracked: TrackedBody): boolean {
    if (plan.shapes.length !== tracked.shapes.length) {
      return false
    }
    if (bodyConfigSignature(plan) !== tracked.bodySignature) {
      return false
    }

    // Pair shapes positionally, matching syncEnabled — all colliders in one array share the root
    // entity id, so entity id alone can't disambiguate them. A positional entity-id mismatch means
    // the contributing shape set changed structurally, so fall back to a full despawn/respawn.
    for (let i = 0; i < plan.shapes.length; i++) {
      if (plan.shapes[i]!.entityId.value !== tracked.shapes[i]!.entityId) {
        return false
      }
    }

    const physicsWorld = this.physicsSystem.getPhysicsWorldForEntity(plan.rootId)
    if (!physicsWorld) {
      return false
    }

    let changed = false
    for (let i = 0; i < plan.shapes.length; i++) {
      const shapePlan = plan.shapes[i]!
      const trackedShape = tracked.shapes[i]!
      const nextSignature = shapePlanSignature(shapePlan)
      if (trackedShape.signature === nextSignature) {
        continue
      }
      trackedShape.handle = physicsWorld.replaceShape(trackedShape.handle, shapePlan.shape)
      trackedShape.signature = nextSignature
      // A replaced shape starts from the backend's default enabled state, so re-assert the intended
      // one here rather than relying on syncEnabled (which no-ops when the old/new flags match).
      physicsWorld.setShapeEnabled(trackedShape.handle, shapePlan.enabled)
      trackedShape.enabled = shapePlan.enabled
      changed = true
    }

    return changed
  }

  private despawnTracked(rootId: string): void {
    const tracked = this.tracked.get(rootId)
    if (!tracked) {
      return
    }

    const physicsWorld = this.physicsSystem.getPhysicsWorldForEntity(rootId)
    if (physicsWorld) {
      for (const shape of tracked.shapes) {
        physicsWorld.detachShape(shape.handle)
      }
      physicsWorld.destroyBody(tracked.body)
    }

    if (tracked.registered) {
      this.physicsSystem.unregisterBody(entityId(rootId))
    }

    this.tracked.delete(rootId)
    this.needsQueryRefresh = true
  }
}

function shapePlanSignature(shape: BodyPlan['shapes'][number]): string {
  return JSON.stringify({
    entityId: shape.entityId.value,
    collider: shape.collider,
    localTransform: shape.localTransform,
  })
}
