import { describe, expect, it } from 'vitest'
import {
  ColliderComponent,
  AnimatableBodyComponent,
  PhysicsAreaComponent,
  RigidBodyComponent,
  TransformComponent,
  World,
} from '@haku/core'
import { ColliderSchema, PhysicsAreaSchema, RigidBodySchema } from '@haku/schema'
import { collectBodyPlans, resolveBodyPlan } from './physics-body-plan.js'

describe('physics-body-plan', () => {
  it('keeps config signature stable when only world Transform pose changes', () => {
    const world = new World()
    const id = world.createEntity('Box')
    world.addComponent(id, TransformComponent, {
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(id, RigidBodyComponent, RigidBodySchema.parse({ type: 'dynamic' }))
    world.addComponent(
      id,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'box', halfExtents: [0.5, 0.5, 0.5] }),
    )

    const before = resolveBodyPlan(world, id)
    expect(before).not.toBeNull()

    world.addComponent(id, TransformComponent, {
      position: [0, 0.2, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    const after = resolveBodyPlan(world, id)
    expect(after).not.toBeNull()
    expect(after!.signature).toBe(before!.signature)
    // Spawn pose still reflects ECS for initial createBody.
    expect(after!.bodyDescriptor.transform.position[1]).toBeCloseTo(0.2)
  })

  it('collects compound colliders from child entities into one body plan', () => {
    const world = new World()
    const rootId = world.createEntity('Compound')
    world.addComponent(rootId, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(rootId, RigidBodyComponent, RigidBodySchema.parse({ type: 'dynamic' }))
    world.addComponent(
      rootId,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'box', halfExtents: [1, 1, 1] }),
    )

    const childId = world.createEntity('ChildCollider')
    world.setParent(childId, rootId)
    world.addComponent(childId, TransformComponent, {
      position: [2, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      childId,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'sphere', radius: 0.5 }),
    )

    const plan = resolveBodyPlan(world, rootId)
    expect(plan).not.toBeNull()
    expect(plan!.shapes).toHaveLength(2)
    expect(plan!.bodyType).toBe('dynamic')
  })

  it('does not double-spawn a collider-only child under a collider-only parent', () => {
    const world = new World()
    const parentId = world.createEntity('Wall')
    world.addComponent(parentId, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      parentId,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'box', halfExtents: [1, 1, 1] }),
    )

    const childId = world.createEntity('WallTrim')
    world.setParent(childId, parentId)
    world.addComponent(childId, TransformComponent, {
      position: [2, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      childId,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'box', halfExtents: [0.5, 0.5, 0.5] }),
    )

    const plans = collectBodyPlans(world)
    // The child is absorbed into the parent's compound body, not spawned as a second root.
    expect(plans).toHaveLength(1)
    expect(plans[0]?.rootId.value).toBe(parentId.value)
    expect(plans[0]?.shapes).toHaveLength(2)
  })

  it('stops compound collection at nested RigidBody roots', () => {
    const world = new World()
    const rootId = world.createEntity('Root')
    world.addComponent(rootId, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(rootId, RigidBodyComponent, RigidBodySchema.parse({ type: 'dynamic' }))
    world.addComponent(
      rootId,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'box', halfExtents: [1, 1, 1] }),
    )

    const nestedId = world.createEntity('NestedBody')
    world.setParent(nestedId, rootId)
    world.addComponent(nestedId, TransformComponent, {
      position: [3, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      nestedId,
      RigidBodyComponent,
      RigidBodySchema.parse({ type: 'dynamic' }),
    )
    world.addComponent(
      nestedId,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'sphere', radius: 0.25 }),
    )

    const plans = collectBodyPlans(world)
    expect(plans).toHaveLength(2)
    expect(plans.find((plan) => plan.rootId.value === rootId.value)?.shapes).toHaveLength(1)
    expect(plans.find((plan) => plan.rootId.value === nestedId.value)?.shapes).toHaveLength(1)
  })

  it('builds a static sensor body plan for PhysicsArea roots', () => {
    const world = new World()
    const areaId = world.createEntity('Area')
    world.addComponent(areaId, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(areaId, PhysicsAreaComponent, PhysicsAreaSchema.parse({}))
    world.addComponent(
      areaId,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'box', halfExtents: [2, 2, 2] }),
    )

    const plan = resolveBodyPlan(world, areaId)
    expect(plan?.bodyType).toBe('static')
    expect(plan?.shapes[0]?.shape.spawn?.isArea).toBe(true)
    expect(plan?.shapes[0]?.shape.spawn?.isSensor).toBe(true)
  })

  it('passes contact monitor flags from RigidBody to collider spawn options', () => {
    const world = new World()
    const rootId = world.createEntity('Monitored')
    world.addComponent(rootId, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      rootId,
      RigidBodyComponent,
      RigidBodySchema.parse({ type: 'dynamic', contactMonitor: true, maxReportedContacts: 2 }),
    )
    world.addComponent(
      rootId,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'box', halfExtents: [0.5, 0.5, 0.5] }),
    )

    const plan = resolveBodyPlan(world, rootId)
    expect(plan?.shapes[0]?.shape.spawn?.contactMonitor).toBe(true)
    expect(plan?.shapes[0]?.shape.spawn?.maxReportedContacts).toBe(2)
    expect(plan?.shapes[0]?.shape.spawn?.collisionEvents).toBe(true)
  })

  it('builds kinematic body plan for AnimatableBody without RigidBody', () => {
    const world = new World()
    const rootId = world.createEntity('Platform')
    world.addComponent(rootId, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      rootId,
      AnimatableBodyComponent,
      { enabled: true, syncMode: 'physics' },
    )
    world.addComponent(
      rootId,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'box', halfExtents: [2, 0.25, 2] }),
    )

    const plan = resolveBodyPlan(world, rootId)
    expect(plan?.bodyType).toBe('kinematic')
    expect(plan?.bodyDescriptor.kinematicMode).toBe('position')
  })
})
