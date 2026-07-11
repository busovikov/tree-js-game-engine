import { describe, expect, it } from 'vitest'
import { ColliderComponent } from '@haku/core'
import { loadSceneDocument, roundtripSceneDocument, saveSceneDocument, validateSceneDocument } from './index.js'

const TRANSFORM = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }

function entityWithCollider(
  id: string,
  name: string,
  collider: Record<string, unknown>,
) {
  return {
    id,
    name,
    parent: null,
    components: [
      { type: 'Transform', data: TRANSFORM },
      { type: 'Collider', data: collider },
    ],
  }
}

describe('Collider serializer round-trip', () => {
  it('round-trips box collider with all fields', () => {
    const collider = {
      shape: 'box',
      halfExtents: [1, 0.25, 2],
      offset: [0, 1, 0],
      rotation: [0, 0.7071068, 0, 0.7071068],
      isStatic: false,
      physicsBodyHandle: 'body-42',
    }
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'BoxCollider' },
      entities: [entityWithCollider('a0000000-0000-4000-8000-000000000001', 'Box', collider)],
    })

    const once = roundtripSceneDocument(doc)
    const colliderData = once.entities[0].components.find((c) => c.type === 'Collider')?.data
    expect(colliderData).toEqual(collider)

    const twice = roundtripSceneDocument(once)
    expect(twice).toEqual(once)
  })

  it('round-trips sphere collider', () => {
    const collider = {
      shape: 'sphere',
      radius: 1.25,
      offset: [0.5, 0, -0.5],
      isStatic: true,
    }
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'SphereCollider' },
      entities: [entityWithCollider('b0000000-0000-4000-8000-000000000002', 'Sphere', collider)],
    })

    const saved = roundtripSceneDocument(doc)
    const colliderData = saved.entities[0].components.find((c) => c.type === 'Collider')?.data
    expect(colliderData).toMatchObject(collider)
    expect(colliderData?.rotation).toEqual([0, 0, 0, 1])
  })

  it('round-trips capsule collider', () => {
    const collider = {
      shape: 'capsule',
      radius: 0.4,
      halfHeight: 0.8,
      offset: [0, 0.5, 0],
      rotation: [0, 0, 0, 1],
      isStatic: false,
    }
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'CapsuleCollider' },
      entities: [entityWithCollider('c0000000-0000-4000-8000-000000000003', 'Capsule', collider)],
    })

    const saved = roundtripSceneDocument(doc)
    const colliderData = saved.entities[0].components.find((c) => c.type === 'Collider')?.data
    expect(colliderData).toEqual(collider)
  })

  it('round-trips scene with multiple collider shapes idempotently', () => {
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'MultiCollider' },
      entities: [
        entityWithCollider('a0000000-0000-4000-8000-000000000001', 'Ground', {
          shape: 'box',
          halfExtents: [10, 0.1, 10],
          isStatic: true,
        }),
        entityWithCollider('b0000000-0000-4000-8000-000000000002', 'Ball', {
          shape: 'sphere',
          radius: 0.5,
          isStatic: false,
        }),
        entityWithCollider('c0000000-0000-4000-8000-000000000003', 'Pillar', {
          shape: 'capsule',
          radius: 0.3,
          halfHeight: 1,
        }),
      ],
    })

    const once = roundtripSceneDocument(doc)
    const twice = roundtripSceneDocument(once)
    expect(twice).toEqual(once)
    expect(once.entities).toHaveLength(3)
    expect(once.entities.every((e) => e.components.some((c) => c.type === 'Collider'))).toBe(true)
  })

  it('entities without collider have no Collider component (backward compat)', () => {
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'NoCollider' },
      entities: [
        {
          id: 'd0000000-0000-4000-8000-000000000004',
          name: 'Plain',
          parent: null,
          components: [{ type: 'Transform', data: TRANSFORM }],
        },
      ],
    })

    const world = loadSceneDocument(doc)
    const id = world.getAllEntities()[0]
    expect(world.getComponent(id, ColliderComponent)).toBeUndefined()

    const saved = saveSceneDocument(world, doc.metadata)
    expect(saved.entities[0].components.some((c) => c.type === 'Collider')).toBe(false)
  })

  it('rejects invalid collider data on load', () => {
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'InvalidCollider' },
      entities: [
        entityWithCollider('e0000000-0000-4000-8000-000000000005', 'Bad', {
          shape: 'box',
          halfExtents: [-1, 0.5, 0.5],
        }),
      ],
    })

    expect(() => loadSceneDocument(doc)).toThrow()
  })
})
