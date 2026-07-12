import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateSceneDocument } from '@haku/schema'
import { PLAYGROUND_DEMO_SCENES } from './playground-demos.js'

const repoRoot = resolve(import.meta.dirname, '../../../..')

describe('playground demo scenes', () => {
  it('catalog lists unique scene paths', () => {
    const paths = PLAYGROUND_DEMO_SCENES.map((demo) => demo.scenePath)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it.each(PLAYGROUND_DEMO_SCENES.map((demo) => [demo.id, demo.scenePath]))(
    '%s scene validates',
    (_id, scenePath) => {
      const absolute = resolve(repoRoot, 'apps/playground', scenePath.replace(/^public\//, 'public/'))
      const raw = readFileSync(absolute, 'utf8')
      const document = validateSceneDocument(JSON.parse(raw))
      expect(document.entities.length).toBeGreaterThan(0)
    },
  )
})
