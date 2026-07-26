import { describe, expect, it } from 'vitest'
import {
  CONTROLLER_COMPONENTS,
  CustomRaycastControllerComponent,
  createCoreComponentRegistry,
  coreComponents,
  getCoreComponent,
} from '../components.js'

describe('controller components registry', () => {
  it('registers all seven controller component ids', () => {
    const registry = createCoreComponentRegistry()
    for (const component of CONTROLLER_COMPONENTS) {
      expect(getCoreComponent(component.id)).toBe(component)
      expect(registry.get(component.id)).toBe(component)
      expect(coreComponents.map((entry) => entry.id)).toContain(component.id)
    }
  })

  it('no longer registers PhysicsController', () => {
    expect(getCoreComponent('PhysicsController')).toBeUndefined()
    expect(createCoreComponentRegistry().get('PhysicsController')).toBeUndefined()
  })

  it('provides CustomRaycastController defaults without nested type', () => {
    const data = CustomRaycastControllerComponent.defaults?.()
    expect(data).toBeDefined()
    expect(data).not.toHaveProperty('type')
    expect(data?.enabled).toBe(true)
    expect(data?.chassis.mass).toBe(250)

    const parsed = CustomRaycastControllerComponent.schema.parse({
      engine: { force: 40 },
      physicsHandle: 'runtime-only',
    })
    expect(parsed.engine.force).toBe(40)
    expect(parsed.physicsHandle).toBe('runtime-only')
  })
})
