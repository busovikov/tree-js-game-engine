/**
 * @vitest-environment happy-dom
 */
import { World } from '@haku/core'
import { setHakuLogSink } from '@haku/engine'
import { validateSceneDocument } from '@haku/schema'
import {
  CUSTOM_COMPONENT_TYPE_ASSET_TYPE,
  MODEL_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  TEXTURE_ASSET_TYPE,
  assetRef,
  dependencyClosure,
  validateProjectManifest,
} from '@haku/assets'
import { UI_DOCUMENT_ASSET_TYPE, UIDocumentSchema } from '@haku/ui'
import { AUDIO_CLIP_ASSET_TYPE } from '@haku/audio'
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

  it('loads visual component type assets before hydrating a scene', async () => {
    const service = new ProjectService()
    const sceneAssetId = '10000000-0000-4000-8000-000000000021'
    const componentTypeId = '42000000-0000-4000-8000-000000000021'
    const entityId = 'a0000000-0000-4000-8000-000000000021'
    service.openFromManifest(
      'custom-components',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Custom components',
        entryScene: { $ref: sceneAssetId, type: SCENE_ASSET_TYPE },
        assetsDir: 'public/assets',
        scriptsDir: 'src',
        assets: [
          {
            id: sceneAssetId,
            type: SCENE_ASSET_TYPE,
            path: 'scenes/main.scene.json',
          },
          {
            id: componentTypeId,
            type: CUSTOM_COMPONENT_TYPE_ASSET_TYPE,
            path: 'components/mover.component.json',
          },
        ],
      }),
    )
    browserProjectStore.registerFile(
      'public/assets/components/mover.component.json',
      {
        content: JSON.stringify({
          schemaVersion: 1,
          id: componentTypeId,
          name: 'Mover',
          version: 1,
          fields: [{ name: 'speed', type: 'number', default: 4 }],
        }),
      },
    )
    browserProjectStore.registerFile('public/assets/scenes/main.scene.json', {
      content: JSON.stringify({
        schemaVersion: 1,
        metadata: { name: 'Main' },
        entities: [
          {
            id: entityId,
            name: 'Runner',
            parent: null,
            components: [{ type: componentTypeId, data: { speed: 9 } }],
          },
        ],
      }),
    })

    const loaded = await service.loadScene(
      'public/assets/scenes/main.scene.json',
    )
    const entity = loaded.world.getAllEntities()[0]!
    const definition = loaded.world.getComponentDefinition(
      entity,
      componentTypeId,
    )!

    expect(definition.name).toBe('Mover')
    expect(loaded.world.getComponent(entity, definition)).toEqual({ speed: 9 })
    expect(
      await service.saveScene(
        'public/assets/scenes/main.scene.json',
        loaded.world,
        loaded.document,
      ),
    ).toMatchObject({
      entities: [
        {
          components: [{ type: componentTypeId, data: { speed: 9 } }],
        },
      ],
    })
  })

  it('creates and registers a visual component type asset in the project', async () => {
    const service = new ProjectService()
    service.openFromManifest(
      'component-authoring',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Component authoring',
        entryScene: {
          $ref: '10000000-0000-4000-8000-000000000031',
          type: SCENE_ASSET_TYPE,
        },
        assetsDir: 'public/assets',
        scriptsDir: 'src',
        assets: [
          {
            id: '10000000-0000-4000-8000-000000000031',
            type: SCENE_ASSET_TYPE,
            path: 'scenes/main.scene.json',
          },
        ],
      }),
    )
    const componentTypeId = '42000000-0000-4000-8000-000000000031'

    const asset = await service.createCustomComponentTypeAsset(
      'public/assets/components/mover.component.json',
      {
        schemaVersion: 1,
        id: componentTypeId,
        name: 'Mover',
        version: 1,
        fields: [{ name: 'speed', type: 'number', default: 4 }],
      },
    )

    expect(asset.id).toBe(componentTypeId)
    expect(service.getCustomComponentTypes()).toEqual([
      expect.objectContaining({ id: componentTypeId, name: 'Mover' }),
    ])
    expect(service.getManifest()?.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: componentTypeId,
          type: CUSTOM_COMPONENT_TYPE_ASSET_TYPE,
          path: 'components/mover.component.json',
        }),
      ]),
    )
    expect(
      JSON.parse(
        await browserProjectStore.readText(
          'public/assets/components/mover.component.json',
        ),
      ),
    ).toEqual(asset)
    await expect(
      service.createCustomComponentTypeAsset(
        'public/assets/components/mover.component.json',
        asset,
      ),
    ).rejects.toThrow(/already exists/)
  })

  it('creates, saves, and reloads UI assets with refreshed manifest dependencies', async () => {
    const service = new ProjectService()
    const sceneAssetId = '10000000-0000-4000-8000-000000000041'
    const textureAssetId = '10000000-0000-4000-8000-000000000042'
    const documentId = '13000000-0000-4000-8000-000000000041'
    const rootId = '13000000-0000-4000-8000-000000000042'
    const imageId = '13000000-0000-4000-8000-000000000043'
    service.openFromManifest(
      'ui-persistence',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'UI persistence',
        entryScene: assetRef(sceneAssetId, SCENE_ASSET_TYPE),
        assetsDir: 'public/assets',
        scriptsDir: 'src',
        assets: [
          {
            id: sceneAssetId,
            type: SCENE_ASSET_TYPE,
            path: 'scenes/main.scene.json',
          },
          {
            id: textureAssetId,
            type: TEXTURE_ASSET_TYPE,
            path: 'textures/logo.png',
          },
        ],
      }),
    )

    const created = await service.createUIDocumentAsset(
      'public/assets/ui/hud.ui.json',
      'HUD',
      documentId,
      rootId,
    )
    const saved = UIDocumentSchema.parse({
      ...created,
      name: 'Saved HUD',
      elements: [
        { ...created.elements[0], children: [imageId] },
        {
          id: imageId,
          type: 'image',
          source: assetRef(textureAssetId, TEXTURE_ASSET_TYPE),
          alt: 'Project logo',
        },
      ],
    })

    await service.saveUIDocumentAsset('public/assets/ui/hud.ui.json', saved)

    expect(await service.loadUIDocumentAsset('public/assets/ui/hud.ui.json')).toEqual(saved)
    expect(service.getManifest()?.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: documentId,
          type: UI_DOCUMENT_ASSET_TYPE,
          path: 'ui/hud.ui.json',
          dependencies: [assetRef(textureAssetId, TEXTURE_ASSET_TYPE)],
          metadata: { name: 'Saved HUD' },
        }),
      ]),
    )
    expect(
      validateProjectManifest(
        JSON.parse(await browserProjectStore.readText('haku.project.json')),
      ),
    ).toEqual(service.getManifest())
  })

  it('retains visual component type definitions in scene and prefab dependency closures', async () => {
    const service = new ProjectService()
    const sceneAssetId = '10000000-0000-4000-8000-000000000032'
    const componentTypeId = '42000000-0000-4000-8000-000000000032'
    const entityId = 'a0000000-0000-4000-8000-000000000032'
    service.openFromManifest(
      'component-export',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Component export',
        entryScene: assetRef(sceneAssetId, SCENE_ASSET_TYPE),
        assetsDir: 'public/assets',
        scriptsDir: 'src',
        assets: [
          {
            id: sceneAssetId,
            type: SCENE_ASSET_TYPE,
            path: 'scenes/main.scene.json',
          },
        ],
      }),
    )
    await service.createCustomComponentTypeAsset(
      'public/assets/components/mover.component.json',
      {
        schemaVersion: 1,
        id: componentTypeId,
        name: 'Mover',
        version: 1,
        fields: [{ name: 'speed', type: 'number', default: 4 }],
      },
    )
    browserProjectStore.registerFile('public/assets/scenes/main.scene.json', {
      content: JSON.stringify({
        schemaVersion: 1,
        metadata: { name: 'Main' },
        entities: [
          {
            id: entityId,
            name: 'Runner',
            parent: null,
            components: [{ type: componentTypeId, data: { speed: 9 } }],
          },
        ],
      }),
    })

    const loaded = await service.loadScene('public/assets/scenes/main.scene.json')
    await service.saveScene(
      'public/assets/scenes/main.scene.json',
      loaded.world,
      loaded.document,
    )
    const prefabRef = await service.createPrefabAsset(
      {
        entities: [
          {
            id: entityId,
            name: 'Runner',
            parent: null,
            components: [{ type: componentTypeId, data: { speed: 9 } }],
          },
        ],
      },
      'Runner',
    )

    const manifest = service.getManifest()!
    const componentTypeRef = assetRef(
      componentTypeId,
      CUSTOM_COMPONENT_TYPE_ASSET_TYPE,
    )
    expect(
      manifest.assets.find((entry) => entry.id === sceneAssetId)?.dependencies,
    ).toContainEqual(componentTypeRef)
    expect(
      manifest.assets.find((entry) => entry.id === prefabRef.$ref)?.dependencies,
    ).toContainEqual(componentTypeRef)
    expect(
      dependencyClosure(manifest, [manifest.entryScene]).map((entry) => entry.id),
    ).toContain(componentTypeId)
    expect(
      dependencyClosure(manifest, [prefabRef]).map((entry) => entry.id),
    ).toContain(componentTypeId)
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

  it('registers imported audio and loads its local bytes through the manifest', async () => {
    const service = new ProjectService()
    service.openFromManifest(
      'audio-project',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Audio project',
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
      'public/assets/audio/tone.wav',
      new File([new Uint8Array([82, 73, 70, 70])], 'tone.wav', {
        type: 'audio/wav',
      }),
    )
    const reference = service.getAssetRefByPath(
      'public/assets/audio/tone.wav',
      AUDIO_CLIP_ASSET_TYPE,
    )
    const clip = await service.loadAudioClipAsset(reference)

    expect([...clip.bytes ?? []]).toEqual([82, 73, 70, 70])
    expect(service.getManifest()?.assets).toContainEqual(
      expect.objectContaining({
        id: reference.$ref,
        type: AUDIO_CLIP_ASSET_TYPE,
        path: 'audio/tone.wav',
        dependencies: [],
      }),
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

describe('ProjectService browser code workspace', () => {
  afterEach(() => {
    browserProjectStore.clear()
  })

  it('persists generated files and exposes imported projects through conflict-safe storage', async () => {
    const service = new ProjectService()
    service.openFromManifest(
      'imported-project',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Imported project',
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
    browserProjectStore.registerFile('src/gameplay.ts', {
      content: 'export const speed = 1',
    })

    const workspace = await service.openCodeWorkspace({
      generatedFiles: {
        'tsconfig.json': '{"compilerOptions":{"strict":true}}\n',
        '.haku/generated/project.d.ts': 'export type ProjectId = "imported-project"\n',
      },
    })

    expect(workspace.trustMode).toBe('imported-untrusted')
    expect(workspace.listFiles()).toEqual([
      '.haku/generated/project.d.ts',
      'src/gameplay.ts',
      'tsconfig.json',
    ])
    expect(await browserProjectStore.readText('.haku/generated/project.d.ts')).toBe(
      'export type ProjectId = "imported-project"\n',
    )

    workspace.editText('src/gameplay.ts', 'export const speed = 3')
    browserProjectStore.writeText('src/gameplay.ts', 'export const speed = 2')

    expect(await workspace.pollExternalChanges()).toEqual([
      { path: 'src/gameplay.ts', status: 'conflict' },
    ])
    expect(workspace.readText('src/gameplay.ts')).toBe('export const speed = 3')
    expect(service.getCodeWorkspace()).toBe(workspace)
  })

  it('opens playground projects as read-only built-ins', async () => {
    const service = new ProjectService()
    service.openFromManifest(
      'playground',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Built-in project',
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
    browserProjectStore.registerFile('src/gameplay.ts', {
      content: 'export const builtIn = true',
    })

    const workspace = await service.openCodeWorkspace()

    expect(workspace.trustMode).toBe('built-in')
    expect(() => workspace.editText('src/gameplay.ts', 'changed')).toThrow(
      'Built-in projects are read-only. Fork the project to edit it.',
    )
  })

  it('keeps an empty source file available to the code workspace', async () => {
    const service = new ProjectService()
    service.openFromManifest(
      'empty-source-project',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Empty source project',
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
    browserProjectStore.registerFile('src/empty.ts', { content: '' })

    const workspace = await service.openCodeWorkspace()

    expect(workspace.readText('src/empty.ts')).toBe('')
  })

  it('writes dev-target code workspace creates and saves through to disk', async () => {
    let diskText = ''
    let lastModified = 0
    const fetchMock = vi.fn().mockImplementation(
      async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          diskText = String(init.body)
          lastModified += 1
          return new Response(null, { status: 204 })
        }
        return new Response(diskText, {
          status: 200,
          headers: {
            'X-Haku-Last-Modified': String(lastModified),
            'X-Haku-File-Size': String(new Blob([diskText]).size),
          },
        })
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    const service = new ProjectService()
    service.openFromManifest(
      'dev-target-project',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Dev target project',
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
    ;(service as unknown as { storage: 'dev-target' }).storage = 'dev-target'
    const workspace = await service.openCodeWorkspace()

    await workspace.createText('src/gameplay.ts', 'export const speed = 1\n')
    workspace.editText('src/gameplay.ts', 'export const speed = 2\n')
    await workspace.saveText('src/gameplay.ts')

    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
    expect(putCalls).toHaveLength(2)
    expect(putCalls[0]).toEqual([
      '/__haku/dev/file',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'X-Haku-File-Path': 'src/gameplay.ts' },
        body: 'export const speed = 1\n',
      }),
    ])
    expect(putCalls[1]).toEqual([
      '/__haku/dev/file',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'X-Haku-File-Path': 'src/gameplay.ts' },
        body: 'export const speed = 2\n',
      }),
    ])
  })

  it('reads dev-target workspace files from disk when polling external changes', async () => {
    let diskText = 'export const speed = 1\n'
    let lastModified = 100
    const fetchMock = vi.fn().mockImplementation(async () => {
      return new Response(diskText, {
        status: 200,
        headers: {
          'X-Haku-Last-Modified': String(lastModified),
          'X-Haku-File-Size': String(new Blob([diskText]).size),
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const service = new ProjectService()
    service.openFromManifest(
      'dev-target-project',
      validateProjectManifest({
        schemaVersion: 1,
        name: 'Dev target project',
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
    ;(service as unknown as { storage: 'dev-target' }).storage = 'dev-target'
    browserProjectStore.registerFile('src/gameplay.ts', { content: diskText })
    const workspace = await service.openCodeWorkspace()

    workspace.editText('src/gameplay.ts', 'export const speed = 3\n')
    diskText = 'export const speed = 2\n'
    lastModified = 200

    expect(await workspace.pollExternalChanges()).toEqual([
      { path: 'src/gameplay.ts', status: 'conflict' },
    ])
    expect(workspace.readText('src/gameplay.ts')).toBe('export const speed = 3\n')
    expect(workspace.getConflict('src/gameplay.ts')).toEqual({
      path: 'src/gameplay.ts',
      diskText: 'export const speed = 2\n',
      editorText: 'export const speed = 3\n',
    })
  })
})
