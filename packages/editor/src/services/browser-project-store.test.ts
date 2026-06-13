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
})
