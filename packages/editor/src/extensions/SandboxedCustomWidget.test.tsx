/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxedCustomWidget } from './SandboxedCustomWidget.js'

afterEach(cleanup)

describe('SandboxedCustomWidget', () => {
  it('is inert and visibly unresolved for an untrusted project', () => {
    render(
      <SandboxedCustomWidget
        trustMode="imported-untrusted"
        componentName="Mover"
        value={{ speed: 2 }}
        onPatch={() => undefined}
      />,
    )

    expect(screen.getByRole('status').textContent).toContain(
      'unresolved because this project is untrusted',
    )
    expect(screen.queryByTitle('Mover custom widget sandbox')).toBeNull()
  })

  it('uses an opaque script-only iframe for the trusted example widget', () => {
    render(
      <SandboxedCustomWidget
        trustMode="local-trusted"
        componentName="Mover"
        value={{ speed: 2 }}
        onPatch={() => undefined}
      />,
    )

    const frame = screen.getByTitle('Mover custom widget sandbox') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.srcdoc).toContain("default-src 'none'")
    expect(frame.srcdoc).toContain('haku-widget:patch')
  })
})
