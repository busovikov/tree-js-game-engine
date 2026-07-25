/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RenderSettingsDialog } from './RenderSettingsDialog.js'

describe('RenderSettingsDialog accessibility', () => {
  afterEach(cleanup)

  it('labels and focuses the dialog, closes on Escape, and restores focus', () => {
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()

    const { rerender } = render(
      <RenderSettingsDialog open onApply={() => undefined} onClose={onClose} />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Render Settings' })
    expect(dialog.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    rerender(
      <RenderSettingsDialog open={false} onApply={() => undefined} onClose={onClose} />,
    )
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('wraps focus from the last action back to the first control', () => {
    render(<RenderSettingsDialog open onApply={() => undefined} onClose={() => undefined} />)
    const dialog = screen.getByRole('dialog', { name: 'Render Settings' })
    const first = screen.getByRole('button', { name: 'Features' })
    const last = screen.getByRole('button', { name: 'Apply' })
    last.focus()

    fireEvent.keyDown(dialog, { key: 'Tab' })

    expect(document.activeElement).toBe(first)
  })
})
