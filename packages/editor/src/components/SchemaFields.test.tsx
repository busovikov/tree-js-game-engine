/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createCustomComponentDefinition } from '@haku/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SchemaFields } from './SchemaFields.js'

afterEach(cleanup)

describe('SchemaFields custom component metadata', () => {
  it('renders declarative labels and emits a schema-valid numeric edit', () => {
    const component = createCustomComponentDefinition({
      schemaVersion: 1,
      id: '42000000-0000-4000-8000-000000000071',
      name: 'Mover',
      version: 1,
      fields: [
        {
          name: 'speed',
          type: 'number',
          default: 4,
          inspector: { label: 'Move Speed', min: 0, max: 10, step: 0.5 },
        },
      ],
    })
    const onChange = vi.fn()
    render(
      <SchemaFields
        componentId={component.id}
        component={component}
        data={{ speed: 4 }}
        onChange={onChange}
      />,
    )

    const input = screen.getByLabelText('Move Speed')
    fireEvent.change(input, {
      target: { value: '6' },
    })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith({ speed: 6 })
  })
})
