import { describe, expect, it } from 'vitest'
import { ComponentDiagnosticError, DefaultComponentRegistry, registerCoreComponents } from '@haku/core'
import { registerPhysicsComponents } from '@haku/physics'
import { roundtripSceneDocument, validateSceneDocument } from '@haku/serializer'
import { registerRenderComponents } from './components.js'

const COMPONENTS = {
  base: { type: '40000000-0000-4000-8000-000000000001', data: {} },
  physics: {
    type: '40000000-0000-4000-8000-000000000009',
    data: { shape: 'box' },
  },
  render: {
    type: '40000000-0000-4000-8000-000000000004',
    data: { geometryType: 'BoxGeometry' },
  },
} as const

function documentWithComponents() {
  return validateSceneDocument({
    schemaVersion: 1,
    metadata: { name: 'Package contributors' },
    entities: [
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        name: 'Mixed entity',
        parent: null,
        components: Object.values(COMPONENTS),
      },
    ],
  })
}

describe('component registry composition', () => {
  it('roundtrips base, physics, and render contributors through one registry', () => {
    const registry = new DefaultComponentRegistry()
    registerCoreComponents(registry)
    registerPhysicsComponents(registry)
    registerRenderComponents(registry)

    const once = roundtripSceneDocument(documentWithComponents(), registry)
    expect(roundtripSceneDocument(once, registry)).toEqual(once)
  })

  it.each([
    ['base', registerPhysicsComponents, registerRenderComponents],
    ['physics', registerCoreComponents, registerRenderComponents],
    ['render', registerCoreComponents, registerPhysicsComponents],
  ])('reports structured diagnostics when %s is omitted', (_name, first, second) => {
    const registry = new DefaultComponentRegistry()
    first(registry)
    second(registry)

    expect(() => roundtripSceneDocument(documentWithComponents(), registry)).toThrowError(
      ComponentDiagnosticError,
    )
    try {
      roundtripSceneDocument(documentWithComponents(), registry)
    } catch (error) {
      expect((error as ComponentDiagnosticError).diagnostics[0]?.code).toBe(
        'component-type.unknown-id',
      )
    }
  })
})
