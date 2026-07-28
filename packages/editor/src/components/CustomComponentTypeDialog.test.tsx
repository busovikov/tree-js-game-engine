/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomComponentTypeDialog } from './CustomComponentTypeDialog.js'

afterEach(cleanup)

describe('CustomComponentTypeDialog', () => {
  it('authors a visual component name and numeric field', () => {
    const onCreate = vi.fn()
    render(
      <CustomComponentTypeDialog
        open
        onClose={() => undefined}
        onCreate={onCreate}
      />,
    )

    fireEvent.change(screen.getByLabelText('Component name'), {
      target: { value: 'Mover' },
    })
    fireEvent.change(screen.getByLabelText('Field name'), {
      target: { value: 'speed' },
    })
    const defaultInput = screen.getByLabelText('Default value')
    fireEvent.change(defaultInput, { target: { value: '4' } })
    fireEvent.blur(defaultInput)
    fireEvent.click(screen.getByRole('button', { name: 'Create Component Type' }))

    expect(onCreate).toHaveBeenCalledWith({
      name: 'Mover',
      fields: [{ name: 'speed', type: 'number', default: 4 }],
    })
  })
})
