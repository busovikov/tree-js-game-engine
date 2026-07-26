import { describe, expect, it } from 'vitest'
import {
  CustomRaycastControllerComponent,
  DynamicRaycastControllerComponent,
  ArcadeVehicleControllerComponent,
  RevoluteJointVehicleControllerComponent,
  KinematicCharacterControllerComponent,
  CharacterBodyControllerComponent,
  PointerControlsControllerComponent,
  type ComponentType,
} from '@haku/core'
import {
  CustomRaycastControllerSchema,
  DynamicRaycastControllerSchema,
  ArcadeVehicleControllerSchema,
  RevoluteJointVehicleControllerSchema,
  KinematicCharacterControllerSchema,
  CharacterBodyControllerSchema,
  PointerControlsControllerSchema,
  LEGACY_CONTROLLER_TYPE_TO_COMPONENT_ID,
  type PhysicsControllerType,
} from '@haku/schema'
import {
  loadSceneDocument,
  sanitizeComponentDataForPersistence,
  saveSceneDocument,
  validateSceneDocument,
} from './index.js'
import { migrateEntityComponents } from './physics-migration.js'

const CONTROLLER_CASES: Array<{
  legacyType: PhysicsControllerType
  component: ComponentType
  schema: { parse: (data: unknown) => unknown }
}> = [
  {
    legacyType: 'custom-raycast',
    component: CustomRaycastControllerComponent,
    schema: CustomRaycastControllerSchema,
  },
  {
    legacyType: 'dynamic-raycast',
    component: DynamicRaycastControllerComponent,
    schema: DynamicRaycastControllerSchema,
  },
  {
    legacyType: 'arcade-vehicle',
    component: ArcadeVehicleControllerComponent,
    schema: ArcadeVehicleControllerSchema,
  },
  {
    legacyType: 'revolute-joint-vehicle',
    component: RevoluteJointVehicleControllerComponent,
    schema: RevoluteJointVehicleControllerSchema,
  },
  {
    legacyType: 'kinematic-character',
    component: KinematicCharacterControllerComponent,
    schema: KinematicCharacterControllerSchema,
  },
  {
    legacyType: 'character-body',
    component: CharacterBodyControllerComponent,
    schema: CharacterBodyControllerSchema,
  },
  {
    legacyType: 'pointer-controls',
    component: PointerControlsControllerComponent,
    schema: PointerControlsControllerSchema,
  },
]

describe('controller serializer policy', () => {
  it.each(CONTROLLER_CASES)(
    'migrates polluted PhysicsController($legacyType) and strips handles on save',
    ({ legacyType, component, schema }) => {
      const newType = LEGACY_CONTROLLER_TYPE_TO_COMPONENT_ID[legacyType]
      const doc = validateSceneDocument({
        schemaVersion: 1,
        metadata: { name: `${legacyType} controller` },
        entities: [
          {
            id: 'a0000000-0000-4000-8000-000000000001',
            name: 'Controller',
            parent: null,
            components: [
              {
                type: newType,
                data: {
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
      const entity = world.getAllEntities()[0]
      const loaded = world.getComponent(entity, component)
      expect(loaded?.physicsHandle).toBe('controller-1')
      expect(world.getComponentTypes(entity)).toContain(newType)
      expect(world.getComponentTypes(entity)).not.toContain('PhysicsController')

      const saved = saveSceneDocument(world, doc.metadata)
      const controllerData = saved.entities[0].components.find(
        (entry) => entry.type === newType,
      )?.data
      expect(controllerData).toEqual(schema.parse({}))
      expect(JSON.stringify(saved)).not.toMatch(/physics(?:Body|Vehicle)?Handle/)
    },
  )

  it('migrateEntityComponents lifts PhysicsController into typed controllers', () => {
    const migrated = migrateEntityComponents([
      {
        type: 'PhysicsController',
        data: { type: 'custom-raycast', engine: { force: 40 } },
      },
    ])
    expect(migrated).toEqual([
      {
        type: '40000000-0000-4000-8000-000000000015',
        data: { engine: { force: 40 } },
      },
    ])
  })

  it('does not strip similarly named fields from unrelated component data', () => {
    const data = {
      physicsHandle: 'authored-value',
      nested: { physicsBodyHandle: 'nested-authored-value' },
    }

    expect(sanitizeComponentDataForPersistence('Script', data)).toEqual(data)
  })
})
