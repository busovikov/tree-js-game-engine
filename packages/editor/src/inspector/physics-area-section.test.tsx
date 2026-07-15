/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { defaultPhysicsProjectSettings } from '@haku/schema'
import { PhysicsAreaFields, normalizePhysicsArea } from '../components/PhysicsAreaFields.js'

describe('PhysicsAreaFields UI', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders monitoring toggles, layer dropdown, and gravity override', () => {
    render(
      <PhysicsAreaFields
        value={normalizePhysicsArea({ spaceOverride: { gravity: [0, -5, 0] } })}
        physicsSettings={defaultPhysicsProjectSettings()}
      />,
    )

    expect(screen.getByLabelText('Physics area monitoring')).toBeTruthy()
    expect(screen.getByLabelText('Physics area monitorable')).toBeTruthy()
    expect(screen.getByText('Layer')).toBeTruthy()
    expect(screen.getByText('Gravity override (m/s²)')).toBeTruthy()
    expect((screen.getByLabelText('gravity[1]') as HTMLInputElement).value).toBe('-5')
  })
})
