import { describe, expect, it } from 'vitest'
import { TransformComponent, World } from '@haku/core'
import { EntityPool } from '@haku/pool'
import {
  ColliderComponent,
  ColliderSchema,
  RigidBodyComponent,
  RigidBodySchema,
  StubPhysicsBackend,
} from '@haku/physics'
import * as THREE from 'three'
import { RenderSyncSystem } from '../render-sync/render-sync-system.js'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'
import { createEnginePoolParticipant } from './pool-lifecycle.js'

describe('engine pool lifecycle integration', () => {
  it('removes inactive render and physics state and reacquires without stale velocity', () => {
    const world = new World()
    const backend = new StubPhysicsBackend()
    const physics = new PhysicsWorldSystem()
    physics.setBackend(backend)
    const colliders = new PhysicsColliderSystem(physics)
    const scene = new THREE.Scene()
    const render = new RenderSyncSystem(scene)
    render.attach(world)
    const pool = new EntityPool({
      world,
      participants: [
        createEnginePoolParticipant({
          world,
          colliders,
          render,
        }),
      ],
      createInstance() {
        const root = world.createEntity('Physics projectile')
        world.addComponent(root, TransformComponent, TransformComponent.defaults())
        world.addComponent(root, RigidBodyComponent, RigidBodySchema.parse({
          type: 'dynamic',
        }))
        world.addComponent(root, ColliderComponent, ColliderSchema.parse({
          shape: 'sphere',
          radius: 0.5,
        }))
        return root
      },
    })
    pool.prewarm(1)

    const first = pool.acquire()!
    const root = { __brand: 'EntityId' as const, value: first.entity }
    expect(render.getObject3D(root)).toBeDefined()
    expect(physics.getBodyHandle(root)).not.toBeNull()
    physics.setBodyLinearVelocity(root, [9, 8, 7])

    pool.release(first)

    expect(render.getObject3D(root)).toBeUndefined()
    expect(scene.children).toHaveLength(0)
    expect(physics.getBodyHandle(root)).toBeNull()

    pool.acquire()

    expect(render.getObject3D(root)).toBeDefined()
    expect(physics.getBodyHandle(root)).not.toBeNull()
    expect(physics.getBodyLinearVelocity(root)).toEqual([0, 0, 0])
  })
})
