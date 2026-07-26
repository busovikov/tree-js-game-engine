/**
 * @vitest-environment happy-dom
 */
import { World } from '@haku/core'
import { setHakuLogSink } from '@haku/engine'
import { validateSceneDocument } from '@haku/schema'
import { MODEL_ASSET_TYPE, SCENE_ASSET_TYPE, validateProjectManifest } from '@haku/assets'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { globalCommandBus } from '../commands/command-bus.js'
import { useEditorStore } from '../store/editor-store.js'
import { browserProjectStore } from './browser-project-store.js'
import { ProjectService } from './project-service.js'

describe('ProjectService disk saving', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setHakuLogSink(null)
    globalCommandBus.clear()
    browserProjectStore.clear()
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

  it('writes playground editor settings through the project file endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const service = new ProjectService()
    ;(service as unknown as { storage: 'playground' }).storage = 'playground'

    await service.saveEditorSettings()

    expect(fetchMock).toHaveBeenCalledWith(
      '/__haku/project/file',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'X-Haku-File-Path': '.haku/editor.json' },
      }),
    )
  })

  it('contains and reports background workspace persistence failures', async () => {
    const service = new ProjectService()
    const write = vi.fn()
    setHakuLogSink({ write })
    vi.spyOn(service, 'persistSceneWorkspace').mockRejectedValue(new Error('disk unavailable'))

    service.persistSceneWorkspaceInBackground(
      'public/assets/scenes/main.scene.json',
      {
        position: [0, 0, 5],
        target: [0, 0, 0],
      },
      'scene',
    )

    await vi.waitFor(() => {
      expect(write).toHaveBeenCalledWith(
        'error',
        'scene',
        'workspace.save.failed',
        expect.objectContaining({
          scenePath: 'public/assets/scenes/main.scene.json',
          storage: 'memory',
        }),
      )
    })
  })

  it('registers imports and preserves an asset ID across path moves', async () => {
    const service = new ProjectService()
    service.openFromManifest(
      'test-project',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Test project',
        entryScene: {
          $ref: '10000000-0000-4000-8000-000000000001',
          type: SCENE_ASSET_TYPE,
        },
        assetsDir: 'public/assets',
        scriptsDir: 'scripts',
        assets: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            type: SCENE_ASSET_TYPE,
            path: 'scenes/main.scene.json',
          },
        ],
      }),
    )

    await service.importAsset(
      'public/assets/models/car.glb',
      new File([new Uint8Array([1, 2, 3])], 'car.glb'),
    )
    const imported = service.getAssetRefByPath('public/assets/models/car.glb', MODEL_ASSET_TYPE)

    await service.renameAsset('public/assets/models/car.glb', 'renamed.glb')

    expect(service.getAssetRefByPath('public/assets/models/renamed.glb', MODEL_ASSET_TYPE)).toEqual(
      imported,
    )
    expect(JSON.parse(await browserProjectStore.readText('haku.project.json')).assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: imported.$ref,
          path: 'models/renamed.glb',
        }),
      ]),
    )
  })

  it('assigns a new ID when an asset is duplicated', async () => {
    const service = new ProjectService()
    service.openFromManifest(
      'test-project',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Test project',
        entryScene: {
          $ref: '10000000-0000-4000-8000-000000000001',
          type: SCENE_ASSET_TYPE,
        },
        assetsDir: 'public/assets',
        scriptsDir: 'scripts',
        assets: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            type: SCENE_ASSET_TYPE,
            path: 'scenes/main.scene.json',
          },
          {
            id: '10000000-0000-4000-8000-000000000002',
            type: MODEL_ASSET_TYPE,
            path: 'models/car.glb',
          },
        ],
      }),
    )
    browserProjectStore.registerFile('public/assets/models/car.glb', {
      file: new File([new Uint8Array([1, 2, 3])], 'car.glb'),
      isBinary: true,
    })

    const duplicatePath = await service.duplicateAsset('public/assets/models/car.glb')
    const duplicate = service.getAssetRefByPath(duplicatePath, MODEL_ASSET_TYPE)

    expect(duplicatePath).toBe('public/assets/models/car copy.glb')
    expect(duplicate.$ref).not.toBe('10000000-0000-4000-8000-000000000002')
  })
})
