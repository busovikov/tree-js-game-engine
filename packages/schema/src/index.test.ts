import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateSceneDocument } from '../src/index.js'

describe('@haku/schema', () => {
  it('validates minimal.scene.json', () => {
    const path = join(import.meta.dirname, '../../../examples/minimal.scene.json')
    const json = JSON.parse(readFileSync(path, 'utf-8'))
    const doc = validateSceneDocument(json)
    expect(doc.schemaVersion).toBe(1)
    expect(doc.entities).toHaveLength(3)
  })
})
