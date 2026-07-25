/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WelcomeScreen } from './WelcomeScreen.js'

describe('WelcomeScreen', () => {
  afterEach(cleanup)

  it('offers the three useful ways to start', () => {
    const open = vi.fn()
    const create = vi.fn()
    const tryDemo = vi.fn()
    render(
      <WelcomeScreen
        canCreate
        onOpen={open}
        onCreate={create}
        onTryDemo={tryDemo}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Try a demo' }))

    expect(open).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
    expect(tryDemo).toHaveBeenCalledOnce()
  })
})
