import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RenderSettingsSchema } from '@haku/schema'
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

})
