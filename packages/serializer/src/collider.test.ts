import { describe, expect, it } from 'vitest'
import { ColliderComponent, RigidBodyComponent } from '@haku/core'
import { loadSceneDocument, roundtripSceneDocument, saveSceneDocument, validateSceneDocument } from './index.js'
import { migrateEntityComponents } from './physics-migration.js'

const TRANSFORM = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }

function entityWithCollider(
  id: string,
  name: string,
  collider: Record<string, unknown>,
  extraComponents: Array<{ type: string; data: Record<string, unknown> }> = [],
) {
  return {
    id,
    name,
    parent: null,
    components: [
      { type: 'Transform', data: TRANSFORM },
      { type: 'Collider', data: collider },
      ...extraComponents,
    ],
  }
}

describe('Collider serializer round-trip', () => {
  it('migrates legacy dynamic collider to Collider + RigidBody and strips runtime handles on save', () => {
    const collider = {
      shape: 'box',
      halfExtents: [1, 0.25, 2],
      offset: [0, 1, 0],
      rotation: [0, 0.7071068, 0, 0.7071068],
      isStatic: false,
      physicsBodyHandle: 'body-42',
      physicsHandle: 'controller-42',
      physicsVehicleHandle: 'legacy-vehicle-42',
    }
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'BoxCollider' },
      entities: [entityWithCollider('a0000000-0000-4000-8000-000000000001', 'Box', collider)],
    })

    const world = loadSceneDocument(doc)
    const id = world.getAllEntities()[0]
    const loadedCollider = world.getComponent(id, ColliderComponent)
    const loadedRigidBody = world.getComponent(id, RigidBodyComponent)
    expect(loadedCollider?.shape).toBe('box')
    expect(loadedCollider).not.toHaveProperty('isStatic')
    expect(loadedRigidBody?.type).toBe('dynamic')
    expect(loadedRigidBody?.physicsBodyHandle).toBe('body-42')

    const saved = saveSceneDocument(world, doc.metadata)
    const colliderData = saved.entities[0].components.find((c) => c.type === 'Collider')?.data
    const rigidBodyData = saved.entities[0].components.find((c) => c.type === 'RigidBody')?.data
    expect(colliderData).toEqual({
      shape: 'box',
      enabled: true,
      halfExtents: [1, 0.25, 2],
      offset: [0, 1, 0],
      rotation: [0, 0.7071068, 0, 0.7071068],
      isTrigger: false,
      materialId: '',
      layer: 0,
      unsupportedShapePolicy: 'skip',
    })
    expect(rigidBodyData).toMatchObject({ type: 'dynamic' })
    expect(JSON.stringify(saved)).not.toMatch(/physics(?:Body|Vehicle)?Handle/)
  })

  it('keeps implicit static collider without RigidBody when legacy isStatic is true', () => {
    const migrated = migrateEntityComponents([
      { type: 'Collider', data: { shape: 'box', isStatic: true } },
    ])
    expect(migrated.some((c) => c.type === 'RigidBody')).toBe(false)
  })

  it('drops the removed custom-spring controller so legacy scenes still load', () => {
    const migrated = migrateEntityComponents([
      { type: 'Transform', data: TRANSFORM },
      { type: 'PhysicsController', data: { type: 'custom-spring', stiffness: 10 } },
    ])
    expect(migrated.some((c) => c.type === 'PhysicsController')).toBe(false)
    // A scene document containing it must load without throwing.
    expect(() =>
      loadSceneDocument({
        schemaVersion: 1,
        metadata: { name: 'LegacyCustomSpring' },
        entities: [
          {
            id: 'b0000000-0000-4000-8000-0000000000c5',
            name: 'Spring',
            parent: null,
            components: [
              { type: 'Transform', data: TRANSFORM },
              { type: 'PhysicsController', data: { type: 'custom-spring', stiffness: 10 } },
            ],
          },
        ],
      }),
    ).not.toThrow()
  })

  it('round-trips sphere collider', () => {
    const collider = {
      shape: 'sphere',
      radius: 1.25,
      offset: [0.5, 0, -0.5],
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

  it('round-trips capsule collider with explicit RigidBody', () => {
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'CapsuleCollider' },
      entities: [
        {
          id: 'c0000000-0000-4000-8000-000000000003',
          name: 'Capsule',
          parent: null,
          components: [
            { type: 'Transform', data: TRANSFORM },
            {
              type: 'Collider',
              data: {
                shape: 'capsule',
                radius: 0.4,
                halfHeight: 0.8,
                offset: [0, 0.5, 0],
                rotation: [0, 0, 0, 1],
              },
            },
            { type: 'RigidBody', data: { type: 'dynamic', mass: 2 } },
          ],
        },
      ],
    })

    const saved = roundtripSceneDocument(doc)
    const colliderData = saved.entities[0].components.find((c) => c.type === 'Collider')?.data
    const rigidBodyData = saved.entities[0].components.find((c) => c.type === 'RigidBody')?.data
    expect(colliderData).toMatchObject({
      shape: 'capsule',
      radius: 0.4,
      halfHeight: 0.8,
      offset: [0, 0.5, 0],
    })
    expect(rigidBodyData).toMatchObject({ type: 'dynamic', mass: 2 })
  })

  it('round-trips scene with multiple collider shapes idempotently', () => {
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'MultiCollider' },
      entities: [
        entityWithCollider('a0000000-0000-4000-8000-000000000001', 'Ground', {
          shape: 'box',
          halfExtents: [10, 0.1, 10],
        }),
        entityWithCollider(
          'b0000000-0000-4000-8000-000000000002',
          'Ball',
          { shape: 'sphere', radius: 0.5 },
          [{ type: 'RigidBody', data: { type: 'dynamic' } }],
        ),
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
    expect(once.physicsSettings?.layers).toHaveLength(16)
  })

  it('rejects trimesh collider on dynamic rigid body at load', () => {
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'InvalidTrimesh' },
      entities: [
        {
          id: 'f0000000-0000-4000-8000-000000000006',
          name: 'BadMesh',
          parent: null,
          components: [
            { type: 'Transform', data: TRANSFORM },
            { type: 'Collider', data: { shape: 'trimesh', vertices: [], indices: [] } },
            { type: 'RigidBody', data: { type: 'dynamic' } },
          ],
        },
      ],
    })

    expect(() => loadSceneDocument(doc)).toThrow(/Trimesh collider cannot be used on a dynamic/)
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
