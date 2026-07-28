/**
 * @vitest-environment happy-dom
 */
import {
  GRAPH_ASSET_TYPE,
  GraphAssetSchema,
} from '@haku/graph'
import { SCENE_ASSET_TYPE, validateProjectManifest } from '@haku/assets'
import { afterEach, describe, expect, it } from 'vitest'
import { browserProjectStore } from './browser-project-store.js'
import { ProjectService } from './project-service.js'

const sceneId = '72000000-0000-4000-8000-000000000001'

function openProject(service: ProjectService) {
  service.openFromManifest(
    'graph-project',
    validateProjectManifest({
      schemaVersion: 1,
      name: 'Graph project',
      entryScene: { $ref: sceneId, type: SCENE_ASSET_TYPE },
      assetsDir: 'public/assets',
      scriptsDir: 'scripts',
      assets: [
        {
          id: sceneId,
          type: SCENE_ASSET_TYPE,
          path: 'scenes/main.scene.json',
        },
      ],
    }),
  )
}

describe('ProjectService graph assets', () => {
  afterEach(() => browserProjectStore.clear())

  it('creates, registers, saves, and reloads a strict graph asset', async () => {
    const service = new ProjectService()
    openProject(service)

    const created = await service.createGraphAsset(
      'public/assets/graphs/diagnostic.graph.json',
      'Diagnostic',
      '72000000-0000-4000-8000-000000000002',
    )
    const manifestEntry = service.getManifest()!.assets.find(
      (entry) => entry.path === 'graphs/diagnostic.graph.json',
    )

    expect(manifestEntry).toMatchObject({
      type: GRAPH_ASSET_TYPE,
      metadata: { name: 'Diagnostic' },
    })
    expect(await service.loadGraphAsset(
      'public/assets/graphs/diagnostic.graph.json',
    )).toEqual(created)

    const edited = GraphAssetSchema.parse({
      ...created,
      graph: { ...created.graph, name: 'Edited' },
    })
    await service.saveGraphAsset(
      'public/assets/graphs/diagnostic.graph.json',
      edited,
    )
    expect((await service.loadGraphAsset(
      'public/assets/graphs/diagnostic.graph.json',
    )).graph.name).toBe('Edited')
  })

  it('rejects graph creation outside the project assets root', async () => {
    const service = new ProjectService()
    openProject(service)

    await expect(service.createGraphAsset(
      'graphs/outside.graph.json',
      'Outside',
    )).rejects.toThrow('Asset must be under public/assets/')
    expect(service.getManifest()!.assets).toHaveLength(1)
  })
})
