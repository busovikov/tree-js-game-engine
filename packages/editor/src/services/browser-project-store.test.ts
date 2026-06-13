import { describe, expect, it } from 'vitest'
import { browserProjectStore } from './browser-project-store.js'

describe('browserProjectStore.listDirectory', () => {
  it('lists folders and files at each level', () => {
    browserProjectStore.clear()
    browserProjectStore.registerFile('assets/scenes/menu.scene.json', { content: '{}' })
    browserProjectStore.registerFile('assets/models/box.glb', { isBinary: true })
    browserProjectStore.registerFile('assets/textures/icon.png', { isBinary: true })

    const root = browserProjectStore.listDirectory('assets')
    expect(root.map((e: { name: string }) => e.name).sort()).toEqual(['models', 'scenes', 'textures'])

    const scenes = browserProjectStore.listDirectory('assets/scenes')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].name).toBe('menu.scene.json')
    expect(scenes[0].isDirectory).toBe(false)

    const models = browserProjectStore.listDirectory('assets/models')
    expect(models[0].name).toBe('box.glb')
  })
})
