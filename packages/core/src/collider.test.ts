import { describe, expect, it } from 'vitest'
import {
  ColliderComponent,
  RigidBodyComponent,
  coreComponents,
  getCoreComponent,
  globalComponentRegistry,
} from './index.js'

describe('ColliderComponent registry', () => {
  it('registers Collider with stable type id', () => {
    expect(ColliderComponent.id).toBe('Collider')
    expect(globalComponentRegistry.get('Collider')).toBe(ColliderComponent)
    expect(getCoreComponent('Collider')).toBe(ColliderComponent)
  })

  it('registers RigidBody with stable type id', () => {
    expect(RigidBodyComponent.id).toBe('RigidBody')
    expect(getCoreComponent('RigidBody')).toBe(RigidBodyComponent)
  })

  it('appears in core component list', () => {
    const ids = coreComponents.map((c) => c.id)
    expect(ids).toContain('Collider')
    expect(ids).toContain('RigidBody')
    expect(globalComponentRegistry.all().map((c) => c.id)).toContain('Collider')
  })

  it('provides box defaults via defaults()', () => {
    const data = ColliderComponent.defaults?.()
    expect(data).toMatchObject({
      shape: 'box',
      halfExtents: [0.5, 0.5, 0.5],
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      enabled: true,
      isTrigger: false,
      layer: 0,
    })
  })

  it('validates collider data through schema', () => {
    const parsed = ColliderComponent.schema.parse({
      shape: 'sphere',
      radius: 0.75,
    })
    expect(parsed.shape).toBe('sphere')
    expect(parsed.radius).toBe(0.75)
  })
})
