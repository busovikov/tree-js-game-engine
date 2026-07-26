/**
 * @vitest-environment happy-dom
 */
import {
  PrefabInstanceComponent,
  TransformComponent,
  World,
} from '@haku/core'
import { PREFAB_ASSET_TYPE } from '@haku/assets'
import {
  assetId,
  assetRef,
  validateSceneDocument,
  type PrefabDefinition,
} from '@haku/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { projectService, extractPrefabSubtree } from '../services/project-service.js'
import { useEditorStore } from '../store/editor-store.js'
import { globalCommandBus } from './command-bus.js'
import { placePrefab } from './world-commands.js'

const prefabId = assetId('10000000-0000-4000-8000-000000000099')
const prefab: PrefabDefinition = {
  entities: [
    {
      id: '00000000-0000-4000-8000-000000000099',
      name: 'Prefab root',
      parent: null,
      components: [],
    },
  ],
}

describe('prefab commands', () => {
  afterEach(() => {
    ;(projectService.getPrefabAssets() as Map<string, PrefabDefinition>).clear()
    globalCommandBus.clear()
  })

  it('authors placement overrides with the UUID component type', () => {
    ;(projectService.getPrefabAssets() as Map<string, PrefabDefinition>).set(prefabId, prefab)
    useEditorStore.getState().setScene(
      'scenes/main.scene.json',
      validateSceneDocument({
        schemaVersion: 1,
        metadata: { name: 'Prefab placement' },
        entities: [],
      }),
      new World(),
    )

    placePrefab(assetRef(prefabId, PREFAB_ASSET_TYPE), [1, 2, 3])

    const state = useEditorStore.getState()
    const placed = state.selection[0]!
    const instance = state.world!.getComponent(placed, PrefabInstanceComponent)!
    expect(instance.overrides).toEqual({
      [TransformComponent.id]: { position: [1, 2, 3] },
    })
  })

  it('excludes prefab-instance envelopes when extracting a prefab subtree', () => {
    const world = new World()
    const root = world.createEntity('Root')
    world.addComponent(root, TransformComponent, TransformComponent.defaults!())
    world.addComponent(root, PrefabInstanceComponent, {
      prefab: assetRef(prefabId, PREFAB_ASSET_TYPE),
    })

    const extracted = extractPrefabSubtree(world, root)

    expect(extracted.entities[0]!.components.map((component) => component.type)).toEqual([
      TransformComponent.id,
    ])
  })
})
