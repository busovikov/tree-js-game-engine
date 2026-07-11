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

  it('copies files to a new path', () => {
    browserProjectStore.clear()
    browserProjectStore.registerFile('public/assets/models/box.glb', { isBinary: true })

    browserProjectStore.copyFile('public/assets/models/box.glb', 'public/assets/models/box copy.glb')

    expect(browserProjectStore.has('public/assets/models/box copy.glb')).toBe(true)
    expect(browserProjectStore.getFile('public/assets/models/box copy.glb')?.isBinary).toBe(true)
  })

  it('lists all files recursively under a directory', () => {
    browserProjectStore.clear()
    browserProjectStore.registerFile('public/assets/models/box.glb', { isBinary: true })
    browserProjectStore.registerFile('public/assets/scenes/menu.scene.json', { content: '{}' })

    const files = browserProjectStore.listAllFilesUnder('public/assets')
    expect(files.map((entry) => entry.path).sort()).toEqual([
      'public/assets/models/box.glb',
      'public/assets/scenes/menu.scene.json',
    ])
  })

  it('renames files and folders', () => {
    browserProjectStore.clear()
    browserProjectStore.registerFile('public/assets/models/box.glb', { isBinary: true })
    browserProjectStore.createDirectory('public/assets/archive')
    browserProjectStore.registerFile('public/assets/archive/old.glb', { isBinary: true })

    browserProjectStore.renamePath('public/assets/models/box.glb', 'public/assets/models/crate.glb')
    browserProjectStore.renamePath('public/assets/archive', 'public/assets/backup')

    expect(browserProjectStore.has('public/assets/models/crate.glb')).toBe(true)
    expect(browserProjectStore.has('public/assets/backup/old.glb')).toBe(true)
    expect(browserProjectStore.has('public/assets/archive')).toBe(false)
  })
})
