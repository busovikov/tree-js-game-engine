import type { EntityId, IWorld, ISystem } from '@haku/core'
import { entityId, PhysicsJointComponent } from '@haku/core'
import type { PhysicsJoint } from '@haku/schema'
import type { PhysicsJointHandle } from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'

interface TrackedJoint {
  handle: PhysicsJointHandle
  signature: string
  /** Entity id of bodyA — the joint lives in bodyA's physics world, so despawn must resolve there. */
  bodyA: string
}

function jointSignature(joint: PhysicsJoint): string {
  return JSON.stringify(joint)
}

/**
 * Reconciles {@link PhysicsJointComponent} entities with scene joints in the physics world.
 *
 * Runs before the world step (order 50) so a joint constrains its bodies during the same-frame
 * integration — like the other constraint authors (colliders at 45, controllers at 48). Bodies are
 * created by {@link PhysicsColliderSystem} at order 45, so they already exist here, and joints are
 * built from authored anchors (no dependency on post-step body state).
 */
export class PhysicsJointSystem implements ISystem {
  readonly order = 49.5

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly tracked = new Map<string, TrackedJoint>()

  constructor(physicsSystem: PhysicsWorldSystem) {
    this.physicsSystem = physicsSystem
  }

  update(world: IWorld): void {
    const active = new Set<string>()

    for (const id of world.query(PhysicsJointComponent)) {
      const joint = world.getComponent(id, PhysicsJointComponent)
      if (!joint || joint.enabled === false) {
        continue
      }
      if (!joint.bodyA || !joint.bodyB) {
        continue
      }

      active.add(id.value)
      const signature = jointSignature(joint)
      const existing = this.tracked.get(id.value)
      if (existing?.signature === signature) {
        continue
      }

      if (existing) {
        this.despawnJoint(existing)
      }
      this.spawnJoint(id, joint, signature)
    }

    for (const entityIdValue of [...this.tracked.keys()]) {
      if (!active.has(entityIdValue)) {
        this.despawnJoint(this.tracked.get(entityIdValue)!)
        this.tracked.delete(entityIdValue)
      }
    }
  }

  dispose(): void {
    for (const tracked of this.tracked.values()) {
      this.despawnJoint(tracked)
    }
    this.tracked.clear()
  }

  private spawnJoint(id: EntityId, joint: PhysicsJoint, signature: string): void {
    const bodyAId = entityId(joint.bodyA)
    const bodyBId = entityId(joint.bodyB)
    const physicsWorld = this.physicsSystem.getPhysicsWorldForEntity(bodyAId)
    const bodyA = this.physicsSystem.getBodyHandle(bodyAId)
    const bodyB = this.physicsSystem.getBodyHandle(bodyBId)
    if (!physicsWorld || !bodyA || !bodyB) {
      return
    }

    const handle = physicsWorld.createSceneJoint({
      type: joint.type,
      bodyA,
      bodyB,
      anchorA: joint.anchorA,
      anchorB: joint.anchorB,
      axis: joint.axis,
      limits: joint.limits,
      motor: joint.motor,
      spring: joint.spring,
      ropeLength: joint.ropeLength,
    })
    this.tracked.set(id.value, { handle, signature, bodyA: joint.bodyA })
  }

  private despawnJoint(tracked: TrackedJoint): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorldForEntity(entityId(tracked.bodyA))
    physicsWorld?.removeJoint(tracked.handle)
  }
}
