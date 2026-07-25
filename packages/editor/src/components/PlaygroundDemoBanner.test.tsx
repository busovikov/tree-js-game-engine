/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlaygroundDemoBanner } from './PlaygroundDemoBanner.js'

describe('PlaygroundDemoBanner', () => {
  afterEach(cleanup)

  it('shows controls and an upstream source link for the active demo', () => {
    render(
      <PlaygroundDemoBanner scenePath="public/assets/scenes/demos/isaac/pointer-controls.scene.json" />,
    )

    expect(screen.getByText(/click cube, torus, or sphere/i)).toBeTruthy()
    const source = screen.getByRole('link', { name: /source/i })
    expect(source.getAttribute('href')).toContain('isaac-mason/sketches')
    expect(source.getAttribute('target')).toBe('_blank')
  })

  it('renders nothing for a regular project scene', () => {
    const { container } = render(
      <PlaygroundDemoBanner scenePath="public/assets/scenes/main.scene.json" />,
    )
    expect(container.childElementCount).toBe(0)
  })
})
