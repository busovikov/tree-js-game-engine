import { describe, expect, it } from 'vitest'
import { browserProjectStore } from './browser-project-store.js'

describe('browserProjectStore.listDirectory', () => {
  it('lists folders and files at each level', () => {
    browserProjectStore.clear()
    browserProjectStore.registerFile('public/assets/scenes/menu.scene.json', { content: '{}' })
    browserProjectStore.registerFile('public/assets/models/box.glb', { isBinary: true })
    browserProjectStore.registerFile('public/assets/textures/icon.png', { isBinary: true })

    const root = browserProjectStore.listDirectory('public/assets')
    expect(root.map((e: { name: string }) => e.name).sort()).toEqual(['models', 'scenes', 'textures'])

    const scenes = browserProjectStore.listDirectory('public/assets/scenes')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].name).toBe('menu.scene.json')
    expect(scenes[0].isDirectory).toBe(false)

    const models = browserProjectStore.listDirectory('public/assets/models')
    expect(models[0].name).toBe('box.glb')
  })

  it('creates empty directories via placeholder file', () => {
    browserProjectStore.clear()
    browserProjectStore.createDirectory('public/assets/new-folder')

    const entries = browserProjectStore.listDirectory('public/assets')
    expect(entries.find((e) => e.name === 'new-folder')).toMatchObject({
      name: 'new-folder',
      isDirectory: true,
    })

    const folderEntries = browserProjectStore.listDirectory('public/assets/new-folder')
    expect(folderEntries).toHaveLength(0)
    expect(browserProjectStore.has('public/assets/new-folder/.gitkeep')).toBe(true)
  })
})
