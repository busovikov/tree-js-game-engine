import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RenderSettingsSchema } from '@haku/schema'
import { entityId } from '@haku/core'
import { createEngineComponentRegistry } from '@haku/engine'
import { loadSceneDocument, roundtripSceneDocument, saveSceneDocument, validateSceneDocument } from '../src/index.js'

describe('@haku/serializer roundtrip', () => {
  const componentRegistry = createEngineComponentRegistry()

  it('minimal.scene.json roundtrips idempotently', () => {
    const path = join(import.meta.dirname, '../../../examples/minimal.scene.json')
    const json = JSON.parse(readFileSync(path, 'utf-8'))
    const doc = validateSceneDocument(json)
    const once = roundtripSceneDocument(doc, componentRegistry)
    const twice = roundtripSceneDocument(once, componentRegistry)
    expect(once.renderSettings.version).toBe(1)
    expect(twice).toEqual(once)
  })

  it('saveSceneDocument preserves explicit renderSettings', () => {
    const renderSettings = RenderSettingsSchema.parse({
      features: { shadows: true },
      toneMappingExposure: 1.5,
    })
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'RenderSettingsTest' },
      entities: [],
      renderSettings,
    })
    const saved = saveSceneDocument(
      loadSceneDocument(doc, { componentRegistry }),
      doc.metadata,
      doc.prototypes,
      renderSettings,
      undefined,
      componentRegistry,
    )
    expect(saved.renderSettings.features.shadows).toBe(true)
    expect(saved.renderSettings.toneMappingExposure).toBe(1.5)
  })

  it('rejects invalid JSON', () => {
    expect(() => validateSceneDocument({ schemaVersion: 2 })).toThrow()
  })

  it('roundtrips authored activeSelf and derives inactive descendants at runtime', () => {
    const parentId = 'a0000000-0000-4000-8000-000000000001'
    const childId = 'a0000000-0000-4000-8000-000000000002'
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'Activation' },
      entities: [
        {
          id: parentId,
          name: 'Parent',
          parent: null,
          activeSelf: false,
          components: [],
        },
        {
          id: childId,
          name: 'Child',
          parent: parentId,
          activeSelf: true,
          components: [],
        },
      ],
    })

    const world = loadSceneDocument(doc, { componentRegistry })
    expect(world.getActiveSelf(entityId(parentId))).toBe(false)
    expect(world.getActiveSelf(entityId(childId))).toBe(true)
    expect(world.isActiveInHierarchy(entityId(childId))).toBe(false)

    const saved = saveSceneDocument(
      world,
      doc.metadata,
      doc.prototypes,
      doc.renderSettings,
      doc.physicsSettings,
      componentRegistry,
    )
    expect(saved.entities.map(({ id, activeSelf }) => ({ id, activeSelf }))).toEqual([
      { id: parentId, activeSelf: false },
      { id: childId, activeSelf: true },
    ])
  })

  it('defaults missing authored activity to active', () => {
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'Default activation' },
      entities: [
        {
          id: 'a0000000-0000-4000-8000-000000000003',
          name: 'Legacy active entity',
          parent: null,
          components: [],
        },
      ],
    })

    expect(doc.entities[0]?.activeSelf).toBe(true)
  })
})
