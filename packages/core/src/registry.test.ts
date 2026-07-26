import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ComponentDiagnosticError,
  DefaultComponentRegistry,
  TransformComponent,
} from './index.js'

describe('DefaultComponentRegistry', () => {
  it('reports duplicate component type IDs without replacing the first definition', () => {
    const registry = new DefaultComponentRegistry()
    registry.register(TransformComponent)

    expect(() =>
      registry.register({
        ...TransformComponent,
        schema: z.object({ replacement: z.boolean() }),
      }),
    ).toThrowError(
      expect.objectContaining({
        diagnostics: [
          expect.objectContaining({
            code: 'component-type.duplicate-id',
            componentTypeId: TransformComponent.id,
          }),
        ],
      }),
    )
    expect(registry.require(TransformComponent.id)).toBe(TransformComponent)
  })

  it('reports unknown component type IDs as structured diagnostics', () => {
    const registry = new DefaultComponentRegistry()

    try {
      registry.require('f0000000-0000-4000-8000-000000000099')
      throw new Error('Expected an unknown component diagnostic')
    } catch (error) {
      expect(error).toBeInstanceOf(ComponentDiagnosticError)
      expect((error as ComponentDiagnosticError).diagnostics).toEqual([
        expect.objectContaining({
          code: 'component-type.unknown-id',
          componentTypeId: 'f0000000-0000-4000-8000-000000000099',
        }),
      ])
    }
  })
})
