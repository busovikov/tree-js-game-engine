import { TransformComponent, World } from '@haku/core'
import { createEngineComponentRegistry } from '@haku/engine'
import { describe, expect, it } from 'vitest'
import { instantiatePrefabDefinition } from './prefab-instance.js'

describe('Bounce Run prefab resolver', () => {
  it('instantiates a prefab hierarchy through the public component registry', () => {
    const world = new World()
    const root = instantiatePrefabDefinition({
      world,
      registry: createEngineComponentRegistry(),
      definition: {
        entities: [
          {
            id: 'b1300000-0000-4000-8000-000000000001',
            name: 'Platform',
            parent: null,
            activeSelf: true,
            components: [
              {
                type: TransformComponent.id,
                data: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
              },
            ],
          },
        ],
      },
    })

    expect(world.getEntityName(root)).toBe('Platform')
    expect(world.getComponent(root, TransformComponent)?.position).toEqual([0, 0, 0])
  })

  it('rejects malformed prefabs without exactly one root', () => {
    expect(() =>
      instantiatePrefabDefinition({
        world: new World(),
        registry: createEngineComponentRegistry(),
        definition: { entities: [] },
      }),
    ).toThrow('Prefab must contain exactly one root entity')
  })
})
