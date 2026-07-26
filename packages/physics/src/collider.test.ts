import { describe, expect, it } from 'vitest'
import {
  BoxColliderSchema,
  CapsuleColliderSchema,
  ColliderSchema,
  ColliderShapeSchema,
  SphereColliderSchema,
  TrimeshColliderSchema,
} from './collider.js'
import { RigidBodySchema } from './rigid-body.js'
import {
  PhysicsValidationError,
  validateTrimeshOnDynamicBody,
  validateWorldBoundaryBodyType,
} from './physics-validation.js'

describe('ColliderSchema', () => {
  it('defaults to a 1×1×1 unit box collider', () => {
    const collider = ColliderSchema.parse({ shape: 'box' })
    expect(collider.shape).toBe('box')
    expect(collider.halfExtents).toEqual([0.5, 0.5, 0.5])
    expect(collider.offset).toEqual([0, 0, 0])
    expect(collider.rotation).toEqual([0, 0, 0, 1])
    expect(collider.enabled).toBe(true)
    expect(collider.isTrigger).toBe(false)
    expect(collider.layer).toBe(0)
    expect(collider.materialId).toBe('')
  })

  it('parses box with custom halfExtents and offset', () => {
    const collider = BoxColliderSchema.parse({
      shape: 'box',
      halfExtents: [1, 0.25, 2],
      offset: [0, 1, 0],
      layer: 3,
      isTrigger: true,
    })
    expect(collider.halfExtents).toEqual([1, 0.25, 2])
    expect(collider.offset).toEqual([0, 1, 0])
    expect(collider.layer).toBe(3)
    expect(collider.isTrigger).toBe(true)
  })

  it('parses sphere collider', () => {
    const collider = SphereColliderSchema.parse({ shape: 'sphere', radius: 1.25 })
    expect(collider.shape).toBe('sphere')
    expect(collider.radius).toBe(1.25)
  })

  it('parses capsule collider', () => {
    const collider = CapsuleColliderSchema.parse({
      shape: 'capsule',
      radius: 0.4,
      halfHeight: 0.8,
    })
    expect(collider.shape).toBe('capsule')
    expect(collider.radius).toBe(0.4)
    expect(collider.halfHeight).toBe(0.8)
  })

  it('parses trimesh collider', () => {
    const collider = TrimeshColliderSchema.parse({
      shape: 'trimesh',
      vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    })
    expect(collider.shape).toBe('trimesh')
    expect(collider.vertices).toHaveLength(9)
    expect(collider.indices).toEqual([0, 1, 2])
  })

  it('accepts all collider shape kinds in enum', () => {
    for (const shape of ColliderShapeSchema.options) {
      expect(ColliderShapeSchema.parse(shape)).toBe(shape)
    }
  })

  it('rejects layer index above 15', () => {
    expect(() =>
      BoxColliderSchema.parse({ shape: 'box', layer: 16 }),
    ).toThrow()
  })

  it('rejects non-positive box halfExtents', () => {
    expect(() =>
      BoxColliderSchema.parse({ shape: 'box', halfExtents: [0, 0.5, 0.5] }),
    ).toThrow()
    expect(() =>
      BoxColliderSchema.parse({ shape: 'box', halfExtents: [-1, 0.5, 0.5] }),
    ).toThrow()
  })

  it('rejects non-positive sphere radius', () => {
    expect(() =>
      SphereColliderSchema.parse({ shape: 'sphere', radius: 0 }),
    ).toThrow()
    expect(() =>
      SphereColliderSchema.parse({ shape: 'sphere', radius: -0.5 }),
    ).toThrow()
  })

  it('rejects negative capsule halfHeight', () => {
    expect(() =>
      CapsuleColliderSchema.parse({ shape: 'capsule', radius: 0.3, halfHeight: -1 }),
    ).toThrow()
  })
})

describe('physics validation', () => {
  it('rejects trimesh on dynamic rigid body', () => {
    const collider = TrimeshColliderSchema.parse({ shape: 'trimesh' })
    const rigidBody = RigidBodySchema.parse({ type: 'dynamic' })
    expect(() => validateTrimeshOnDynamicBody({ collider, rigidBody })).toThrow(
      PhysicsValidationError,
    )
  })

  it('allows trimesh on static implicit body', () => {
    const collider = TrimeshColliderSchema.parse({ shape: 'trimesh' })
    expect(() => validateTrimeshOnDynamicBody({ collider })).not.toThrow()
  })

  it('rejects worldBoundary on dynamic body', () => {
    expect(() =>
      validateWorldBoundaryBodyType({
        collider: ColliderSchema.parse({ shape: 'worldBoundary' }),
        rigidBody: RigidBodySchema.parse({ type: 'dynamic' }),
      }),
    ).toThrow(PhysicsValidationError)
  })
})
