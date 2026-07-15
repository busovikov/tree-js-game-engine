import { describe, expect, it, beforeEach } from 'vitest'
import {
  ColliderComponent,
  PhysicsJointComponent,
  RigidBodyComponent,
  TransformComponent,
  World,
} from '@haku/core'
import { ColliderSchema, PhysicsJointSchema, RigidBodySchema } from '@haku/schema'
import { resetStubPhysicsIds, StubPhysicsBackend, type SceneJointConfig, type PhysicsJointHandle } from '@haku/physics'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsJointSystem } from './physics-joint-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'

class JointTrackingBackend extends StubPhysicsBackend {
  readonly sceneJoints: SceneJointConfig[] = []

  override createSceneJoint(config: SceneJointConfig): PhysicsJointHandle {
    this.sceneJoints.push(config)
    return super.createSceneJoint(config)
  }
}

describe('PhysicsJointSystem', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  it('spawns a prismatic scene joint between two rigid bodies', () => {
    const backend = new JointTrackingBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 1 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)
    const jointSystem = new PhysicsJointSystem(physicsSystem)

    const world = new World()
    const bodyAId = world.createEntity('BodyA')
    const bodyBId = world.createEntity('BodyB')
    const jointId = world.createEntity('Joint')

    for (const id of [bodyAId, bodyBId]) {
      world.addComponent(id, TransformComponent, {
        position: id === bodyAId ? [0, 0, 0] : [2, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      })
      world.addComponent(id, RigidBodyComponent, RigidBodySchema.parse({ type: 'dynamic' }))
      world.addComponent(
        id,
        ColliderComponent,
        ColliderSchema.parse({ shape: 'box', halfExtents: [0.5, 0.5, 0.5] }),
      )
    }

    world.addComponent(
      jointId,
      PhysicsJointComponent,
      PhysicsJointSchema.parse({
        type: 'prismatic',
        bodyA: bodyAId.value,
        bodyB: bodyBId.value,
        axis: [1, 0, 0],
        limits: { min: -1, max: 1 },
      }),
    )

    colliderSystem.bootstrap(world)
    jointSystem.update(world)

    expect(backend.sceneJoints).toHaveLength(1)
    expect(backend.sceneJoints[0]?.type).toBe('prismatic')
  })

  it('reconciles joints before the world step so they constrain the same-frame integration', () => {
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 1 })
    const jointSystem = new PhysicsJointSystem(physicsSystem)
    expect(jointSystem.order).toBeLessThan(physicsSystem.order)
  })
})
