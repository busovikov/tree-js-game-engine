import { describe, expect, it } from 'vitest'
import {
  ColliderComponent,
  PHYSICS_COMPONENT_TYPE_IDS,
  RigidBodyComponent,
  physicsComponents,
  registerPhysicsComponents,
} from './index.js'
import { DefaultComponentRegistry } from '@haku/core'

describe('ColliderComponent registry', () => {
  it('registers Collider with stable type id', () => {
    const registry = new DefaultComponentRegistry()
    registerPhysicsComponents(registry)
    expect(ColliderComponent.id).toBe(PHYSICS_COMPONENT_TYPE_IDS.Collider)
    expect(registry.get(ColliderComponent.id)).toBe(ColliderComponent)
  })

  it('registers RigidBody with stable type id', () => {
    expect(RigidBodyComponent.id).toBe(PHYSICS_COMPONENT_TYPE_IDS.RigidBody)
  })

  it('appears in core component list', () => {
    const ids = physicsComponents.map((c) => c.id)
    expect(ids).toContain(ColliderComponent.id)
    expect(ids).toContain(RigidBodyComponent.id)
    const registry = new DefaultComponentRegistry()
    registerPhysicsComponents(registry)
    expect(registry.all().map((c) => c.id)).toContain(ColliderComponent.id)
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
