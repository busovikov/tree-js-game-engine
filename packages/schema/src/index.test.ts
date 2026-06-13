import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ASSETS_DIR, projectPathToUrl, relativeToAssetsDir, validateSceneDocument } from '../src/index.js'

describe('@haku/schema', () => {
  it('validates minimal.scene.json', () => {
    const path = join(import.meta.dirname, '../../../examples/minimal.scene.json')
    const json = JSON.parse(readFileSync(path, 'utf-8'))
    const doc = validateSceneDocument(json)
    expect(doc.schemaVersion).toBe(1)
    expect(doc.entities).toHaveLength(3)
  })

  it('maps public assets to fetch URLs', () => {
    expect(projectPathToUrl('public/assets/scenes/menu.scene.json')).toBe('/assets/scenes/menu.scene.json')
    expect(DEFAULT_ASSETS_DIR).toBe('public/assets')
    expect(relativeToAssetsDir('public/assets/models/box.glb')).toBe('models/box.glb')
  })
})
