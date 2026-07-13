import { describe, expect, it } from 'vitest'
import { PhysicsControllerComponent } from '@haku/core'
import { PhysicsControllerSchema } from '@haku/schema'
import {
  loadSceneDocument,
  sanitizeComponentDataForPersistence,
  saveSceneDocument,
  validateSceneDocument,
} from './index.js'

const CONTROLLER_TYPES = [
  'custom-raycast',
  'dynamic-raycast',
  'arcade-vehicle',
  'revolute-joint-vehicle',
  'kinematic-character',
  'pointer-controls',
] as const

describe('PhysicsController serializer policy', () => {
  it.each(CONTROLLER_TYPES)(
    'loads a polluted %s controller but strips runtime handles when saving',
    (type) => {
      const doc = validateSceneDocument({
        schemaVersion: 1,
        metadata: { name: `${type} controller` },
        entities: [
          {
            id: 'a0000000-0000-4000-8000-000000000001',
            name: 'Controller',
            parent: null,
            components: [
              {
                type: 'PhysicsController',
                data: {
                  type,
                  physicsBodyHandle: 'body-1',
                  physicsHandle: 'controller-1',
                  physicsVehicleHandle: 'legacy-vehicle-1',
                },
              },
            ],
          },
        ],
      })

      const world = loadSceneDocument(doc)
      const loaded = world.getComponent(world.getAllEntities()[0], PhysicsControllerComponent)
      expect(loaded?.physicsHandle).toBe('controller-1')

      const saved = saveSceneDocument(world, doc.metadata)
      const controllerData = saved.entities[0].components.find(
        (component) => component.type === 'PhysicsController',
      )?.data
      expect(controllerData).toEqual(PhysicsControllerSchema.parse({ type }))
      expect(JSON.stringify(saved)).not.toMatch(/physics(?:Body|Vehicle)?Handle/)
    },
  )

  it('does not strip similarly named fields from unrelated component data', () => {
    const data = {
      physicsHandle: 'authored-value',
      nested: { physicsBodyHandle: 'nested-authored-value' },
    }

    expect(sanitizeComponentDataForPersistence('Script', data)).toEqual(data)
  })
})
