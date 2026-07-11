import { describe, expect, it } from 'vitest'
import {
  BoxColliderSchema,
  CapsuleColliderSchema,
  ColliderSchema,
  ColliderShapeSchema,
  SphereColliderSchema,
} from './collider.js'

describe('ColliderSchema', () => {
  it('defaults to a 1×1×1 unit box collider', () => {
    const collider = ColliderSchema.parse({ shape: 'box' })
    expect(collider.shape).toBe('box')
    expect(collider.halfExtents).toEqual([0.5, 0.5, 0.5])
    expect(collider.offset).toEqual([0, 0, 0])
    expect(collider.rotation).toEqual([0, 0, 0, 1])
    expect(collider.isStatic).toBe(true)
    expect(collider.physicsBodyHandle).toBeUndefined()
  })

  it('parses box with custom halfExtents and offset', () => {
    const collider = BoxColliderSchema.parse({
      shape: 'box',
      halfExtents: [1, 0.25, 2],
      offset: [0, 1, 0],
      isStatic: false,
    })
    expect(collider.halfExtents).toEqual([1, 0.25, 2])
    expect(collider.offset).toEqual([0, 1, 0])
    expect(collider.isStatic).toBe(false)
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

  it('accepts optional runtime physicsBodyHandle', () => {
    const collider = ColliderSchema.parse({
      shape: 'box',
      physicsBodyHandle: 'body-42',
    })
    expect(collider.physicsBodyHandle).toBe('body-42')
  })

  it('rejects invalid shape enum', () => {
    expect(() => ColliderShapeSchema.parse('trimesh')).toThrow()
    expect(() =>
      ColliderSchema.parse({ shape: 'trimesh', halfExtents: [1, 1, 1] }),
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
