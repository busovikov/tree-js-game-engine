import { describe, expect, it } from 'vitest'
import {
  PhysicsControllerComponent,
  coreComponents,
  getCoreComponent,
  globalComponentRegistry,
} from '../index.js'
import { PhysicsControllerSchema } from '@haku/schema'

describe('PhysicsControllerComponent registry', () => {
  it('registers with id PhysicsController', () => {
    expect(PhysicsControllerComponent.id).toBe('PhysicsController')
    expect(getCoreComponent('PhysicsController')).toBe(PhysicsControllerComponent)
    expect(globalComponentRegistry.get('PhysicsController')).toBe(PhysicsControllerComponent)
  })

  it('appears in the public core component collections', () => {
    expect(coreComponents.map((component) => component.id)).toContain('PhysicsController')
    expect(globalComponentRegistry.all().map((component) => component.id)).toContain(
      'PhysicsController',
    )
  })

  it('defaults to custom-raycast controller', () => {
    const data = PhysicsControllerComponent.defaults?.()
    expect(data?.type).toBe('custom-raycast')
    expect(data?.enabled).toBe(true)
  })

  it('parses custom-raycast controller data', () => {
    const parsed = PhysicsControllerComponent.schema.parse({
      type: 'custom-raycast',
      engine: { force: 42 },
    })
    expect(parsed.type).toBe('custom-raycast')
    expect(parsed.engine.force).toBe(42)
    expect(PhysicsControllerSchema.parse(parsed)).toEqual(parsed)
  })
})
