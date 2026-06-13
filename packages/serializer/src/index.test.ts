import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSceneDocument, roundtripSceneDocument, validateSceneDocument } from '../src/index.js'

describe('@haku/serializer roundtrip', () => {
  it('minimal.scene.json roundtrips', () => {
    const path = join(import.meta.dirname, '../../../examples/minimal.scene.json')
    const original = validateSceneDocument(JSON.parse(readFileSync(path, 'utf-8')))
    const result = roundtripSceneDocument(original)
    expect(result).toEqual(original)
  })

  it('rejects invalid JSON', () => {
    expect(() => validateSceneDocument({ schemaVersion: 2 })).toThrow()
  })

  it('expands prefab instances by default', () => {
    const doc = validateSceneDocument({
      schemaVersion: 1,
      metadata: { name: 'PrefabTest' },
      prototypes: {},
      prefabs: {
        tree: {
          id: 'tree',
          entities: [
            {
              id: 'b0000000-0000-4000-8000-000000000001',
              name: 'Trunk',
              parent: null,
              components: [
                { type: 'Transform', data: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
                { type: 'MeshRenderer', data: { prototypeId: 'box' } },
              ],
            },
          ],
        },
      },
      entities: [
        {
          id: 'a0000000-0000-4000-8000-000000000001',
          name: 'Instance',
          parent: null,
          components: [
            { type: 'Transform', data: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
            { type: 'PrefabInstance', data: { prefabId: 'tree' } },
          ],
        },
      ],
    })

    const expanded = loadSceneDocument(doc, { expandPrefabs: true })
    expect(expanded.getAllEntities().length).toBeGreaterThan(1)

    const collapsed = loadSceneDocument(doc, { expandPrefabs: false })
    expect(collapsed.getAllEntities()).toHaveLength(1)
  })
})
