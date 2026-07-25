/**
 * @vitest-environment happy-dom
 */
import { World } from '@haku/core'
import { validateSceneDocument } from '@haku/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { globalCommandBus } from '../commands/command-bus.js'
import { useEditorStore } from '../store/editor-store.js'
import { ProjectService } from './project-service.js'

describe('ProjectService dev-target saving', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    globalCommandBus.clear()
  })

  it('writes through to the target and preserves selection and undo history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const service = new ProjectService()
    ;(service as unknown as { storage: 'dev-target' }).storage = 'dev-target'

    const world = new World()
    const selected = world.createEntity('Selected')
    const document = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'Target scene' },
      entities: [],
    })
    useEditorStore.setState({
      world,
      sceneDocument: document,
      scenePath: 'public/assets/scenes/main.scene.json',
      selection: [selected],
    })
    globalCommandBus.record({ execute() {}, undo() {} })

    await service.saveScene('public/assets/scenes/main.scene.json', world, document)

    expect(fetchMock).toHaveBeenCalledWith(
      '/__haku/dev/file',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'X-Haku-File-Path': 'public/assets/scenes/main.scene.json' },
      }),
    )
    expect(useEditorStore.getState().selection).toEqual([selected])
    expect(globalCommandBus.canUndo()).toBe(true)
  })
})
