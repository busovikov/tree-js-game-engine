import type { SceneDocument } from '@haku/schema'
import {
  LIGHT_DEFAULT_LOCAL_POSITION,
  LIGHT_DEFAULT_TARGET_POSITION,
  RenderSettingsSchema,
  defaultPhysicsProjectSettings,
} from '@haku/schema'

const DEFAULT_PHYSICS_SETTINGS = defaultPhysicsProjectSettings()

const SHADOWS_ON = RenderSettingsSchema.parse({
  features: { shadows: true },
  shadows: { enabled: true, followCamera: false, cameraSize: 30, cameraDistance: 50 },
})

function eulerToQuat(xDeg: number, yDeg = 0, zDeg = 0): [number, number, number, number] {
  const x = (xDeg * Math.PI) / 180
  const y = (yDeg * Math.PI) / 180
  const z = (zDeg * Math.PI) / 180
  const c1 = Math.cos(x / 2)
  const s1 = Math.sin(x / 2)
  const c2 = Math.cos(y / 2)
  const s2 = Math.sin(y / 2)
  const c3 = Math.cos(z / 2)
  const s3 = Math.sin(z / 2)
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}

function cubeEntity(
  id: string,
  name: string,
  position: [number, number, number],
): SceneDocument['entities'][number] {
  return {
    id,
    name,
    parent: null,
    components: [
      { type: 'Transform', data: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
      {
        type: 'MeshRenderer',
        data: {
          geometryType: 'BoxGeometry',
          geometryParams: { width: 1, height: 1, depth: 1 },
          material: { type: 'standard', color: '#6699ff', metalness: 0, roughness: 0.5 },
          castShadow: true,
          receiveShadow: true,
        },
      },
    ],
  }
}

/** Sun at -50° pitch; two cubes at different XZ — top-face lighting must match. */
export const directionalPositionInvarianceScene: SceneDocument = {
  schemaVersion: 1,
  metadata: { name: 'probe-directional-position' },
  entities: [
    {
      id: '11111111-1111-4111-8111-111111111101',
      name: 'Sun',
      parent: null,
      components: [
        {
          type: 'Transform',
          data: {
            position: [0, 10, 0],
            rotation: eulerToQuat(-50, 30),
            scale: [1, 1, 1],
          },
        },
        {
          type: 'Light',
          data: {
            type: 'directional',
            intensity: 1.2,
            localPosition: LIGHT_DEFAULT_LOCAL_POSITION,
            targetPosition: LIGHT_DEFAULT_TARGET_POSITION,
          },
        },
      ],
    },
    cubeEntity('11111111-1111-4111-8111-111111111102', 'CubeNear', [0, 0.5, 0]),
    cubeEntity('11111111-1111-4111-8111-111111111103', 'CubeFar', [12, 0.5, -8]),
    {
      id: '11111111-1111-4111-8111-111111111104',
      name: 'Ground',
      parent: null,
      components: [
        {
          type: 'Transform',
          data: {
            position: [0, 0, 0],
            rotation: eulerToQuat(-90),
            scale: [40, 40, 1],
          },
        },
        {
          type: 'MeshRenderer',
          data: {
            geometryType: 'PlaneGeometry',
            geometryParams: { width: 1, height: 1 },
            material: { type: 'standard', color: '#cccccc', metalness: 0, roughness: 0.9 },
            castShadow: false,
            receiveShadow: true,
          },
        },
      ],
    },
  ],
  prototypes: {},
  prefabs: {},
  physicsSettings: DEFAULT_PHYSICS_SETTINGS,
  renderSettings: RenderSettingsSchema.parse({
    features: { shadows: false },
    ambient: { intensity: 0.15 },
  }),
}

/** Same cube; compare lighting with shadows on vs off. */
export const shadowToggleStabilityScene: SceneDocument = {
  ...directionalPositionInvarianceScene,
  metadata: { name: 'probe-shadow-toggle' },
  entities: directionalPositionInvarianceScene.entities.filter((e) => e.name !== 'CubeFar'),
  renderSettings: SHADOWS_ON,
}

/** Cube above ground — shadow probe under cube should be darker than open ground. */
export const shadowCastScene: SceneDocument = {
  schemaVersion: 1,
  metadata: { name: 'probe-shadow-cast' },
  entities: [
    {
      id: '22222222-2222-4222-8222-222222222201',
      name: 'Sun',
      parent: null,
      components: [
        {
          type: 'Transform',
          data: { position: [5, 12, 5], rotation: eulerToQuat(-55, -35), scale: [1, 1, 1] },
        },
        {
          type: 'Light',
          data: {
            type: 'directional',
            intensity: 1.5,
            localPosition: LIGHT_DEFAULT_LOCAL_POSITION,
            targetPosition: LIGHT_DEFAULT_TARGET_POSITION,
          },
        },
      ],
    },
    cubeEntity('22222222-2222-4222-8222-222222222202', 'Caster', [0, 1.5, 0]),
    {
      id: '22222222-2222-4222-8222-222222222203',
      name: 'Ground',
      parent: null,
      components: [
        {
          type: 'Transform',
          data: { position: [0, 0, 0], rotation: eulerToQuat(-90), scale: [20, 20, 1] },
        },
        {
          type: 'MeshRenderer',
          data: {
            geometryType: 'PlaneGeometry',
            geometryParams: { width: 1, height: 1 },
            material: { type: 'standard', color: '#e8e8e8', metalness: 0, roughness: 1 },
            receiveShadow: true,
          },
        },
      ],
    },
  ],
  prototypes: {},
  prefabs: {},
  physicsSettings: DEFAULT_PHYSICS_SETTINGS,
  renderSettings: SHADOWS_ON,
}

/** Hemisphere fill — sphere top vs bottom tint. */
export const hemisphereScene: SceneDocument = {
  schemaVersion: 1,
  metadata: { name: 'probe-hemisphere' },
  entities: [
    {
      id: '33333333-3333-4333-8333-333333333301',
      name: 'SkyFill',
      parent: null,
      components: [
        { type: 'Transform', data: { position: [0, 5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
        {
          type: 'Light',
          data: {
            type: 'hemisphere',
            intensity: 1,
            skyColor: '#88ccff',
            groundColor: '#553311',
          },
        },
      ],
    },
    {
      id: '33333333-3333-4333-8333-333333333302',
      name: 'Sphere',
      parent: null,
      components: [
        { type: 'Transform', data: { position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
        {
          type: 'MeshRenderer',
          data: {
            geometryType: 'SphereGeometry',
            geometryParams: { radius: 1, widthSegments: 24, heightSegments: 16 },
            material: { type: 'standard', color: '#ffffff', metalness: 0, roughness: 0.8 },
          },
        },
      ],
    },
  ],
  prototypes: {},
  prefabs: {},
  physicsSettings: DEFAULT_PHYSICS_SETTINGS,
  renderSettings: RenderSettingsSchema.parse({
    features: { shadows: false, toneMapping: false },
    ambient: { intensity: 0 },
  }),
}

/** Point + spot lights for multi-source coverage. */
export const multiLightScene: SceneDocument = {
  schemaVersion: 1,
  metadata: { name: 'probe-multi-light' },
  entities: [
    {
      id: '44444444-4444-4444-8444-444444444401',
      name: 'Sun',
      parent: null,
      components: [
        {
          type: 'Transform',
          data: { position: [0, 8, 0], rotation: eulerToQuat(-40), scale: [1, 1, 1] },
        },
        {
          type: 'Light',
          data: {
            type: 'directional',
            intensity: 0.8,
            localPosition: LIGHT_DEFAULT_LOCAL_POSITION,
            targetPosition: LIGHT_DEFAULT_TARGET_POSITION,
          },
        },
      ],
    },
    {
      id: '44444444-4444-4444-8444-444444444402',
      name: 'Point',
      parent: null,
      components: [
        { type: 'Transform', data: { position: [-4, 2, 2], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
        {
          type: 'Light',
          data: { type: 'point', intensity: 2, distance: 12, decay: 2, color: '#ffaa66' },
        },
      ],
    },
    {
      id: '44444444-4444-4444-8444-444444444403',
      name: 'Spot',
      parent: null,
      components: [
        {
          type: 'Transform',
          data: { position: [4, 5, 4], rotation: eulerToQuat(-60, 45), scale: [1, 1, 1] },
        },
        {
          type: 'Light',
          data: {
            type: 'spot',
            intensity: 2.5,
            distance: 18,
            decay: 2,
            outerAngle: 35,
            innerAngle: 18,
            color: '#aaddff',
            localPosition: LIGHT_DEFAULT_LOCAL_POSITION,
            targetPosition: LIGHT_DEFAULT_TARGET_POSITION,
          },
        },
      ],
    },
    cubeEntity('44444444-4444-4444-8444-444444444404', 'Subject', [0, 0.5, 0]),
  ],
  prototypes: {},
  prefabs: {},
  physicsSettings: DEFAULT_PHYSICS_SETTINGS,
  renderSettings: RenderSettingsSchema.parse({ ambient: { intensity: 0.05 } }),
}
