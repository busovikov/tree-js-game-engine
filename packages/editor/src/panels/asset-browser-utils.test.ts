import { describe, expect, it } from 'vitest'
import { buildAssetSearchIndex, suggestDuplicateName } from '../panels/asset-browser-utils.js'

describe('buildAssetSearchIndex', () => {
  const assetsRoot = 'public/assets'
  const allFiles = [
    { path: 'public/assets/models/hero.glb', name: 'hero.glb' },
    { path: 'public/assets/scenes/menu.scene.json', name: 'menu.scene.json' },
    { path: 'public/assets/textures/icon.png', name: 'icon.png' },
  ]

  it('returns empty query state without filtering', () => {
    const index = buildAssetSearchIndex(allFiles, '', assetsRoot)
    expect(index.query).toBe('')
    expect(index.firstDirWithMatches).toBeNull()
    expect(index.dirsVisibleInTree.has(assetsRoot)).toBe(true)
  })

  it('finds folders with matching files and first match folder', () => {
    const index = buildAssetSearchIndex(allFiles, 'hero', assetsRoot)
    expect(index.dirsWithMatches.has('public/assets/models')).toBe(true)
    expect(index.dirsVisibleInTree.has('public/assets/models')).toBe(true)
    expect(index.dirsVisibleInTree.has('public/assets/scenes')).toBe(false)
    expect(index.firstDirWithMatches).toBe('public/assets/models')
  })
})

describe('suggestDuplicateName', () => {
  it('uses " copy" suffix before incrementing', () => {
    const existing = new Set(['hero.glb'])
    expect(suggestDuplicateName('hero.glb', existing)).toBe('hero copy.glb')
  })

  it('increments when copy name exists', () => {
    const existing = new Set(['hero.glb', 'hero copy.glb'])
    expect(suggestDuplicateName('hero.glb', existing)).toBe('hero copy 2.glb')
  })
})
