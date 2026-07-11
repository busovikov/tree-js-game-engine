import { describe, expect, it } from 'vitest'
import {
  VehicleComponent,
  coreComponents,
  getCoreComponent,
  globalComponentRegistry,
} from '../index.js'

describe('VehicleComponent registry', () => {
  it('registers Vehicle with stable type id', () => {
    expect(VehicleComponent.id).toBe('Vehicle')
    expect(globalComponentRegistry.get('Vehicle')).toBe(VehicleComponent)
    expect(getCoreComponent('Vehicle')).toBe(VehicleComponent)
  })

  it('appears in core component list', () => {
    const ids = coreComponents.map((c) => c.id)
    expect(ids).toContain('Vehicle')
    expect(globalComponentRegistry.all().map((c) => c.id)).toContain('Vehicle')
  })

  it('provides reference-magnitude defaults via defaults()', () => {
    const data = VehicleComponent.defaults?.()
    expect(data?.chassis.mass).toBe(250)
    expect(data?.engine.force).toBe(1400)
    expect(data?.wheels.radius).toBe(0.42)
    expect(data?.suspension.frictionSlip).toBe(7.8)
    expect(data?.enabled).toBe(true)
  })

  it('validates vehicle data through schema', () => {
    const parsed = VehicleComponent.schema.parse({
      engine: { force: 1800, boostMultiplier: 2 },
      assists: { antiWheelie: false },
    })
    expect(parsed.engine.force).toBe(1800)
    expect(parsed.engine.boostMultiplier).toBe(2)
    expect(parsed.assists.antiWheelie).toBe(false)
    expect(parsed.chassis.mass).toBe(250)
  })
})
