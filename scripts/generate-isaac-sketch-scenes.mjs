/**
 * Generates Haku scene JSON from Isaac Mason Rapier sketches (pinned commit).
 * Source: https://github.com/isaac-mason/sketches/tree/1d474e6713a972c76dcabe8c8b074292d0e9d169/sketches/rapier
 *
 * Run: node scripts/generate-isaac-sketch-scenes.mjs
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const OUT_DIR = join(ROOT, 'apps/playground/public/assets/scenes/demos/isaac')
const ASSETS_ROOT = join(ROOT, 'apps/playground/public/assets')

const ISAAC_COMMIT = '1d474e6713a972c76dcabe8c8b074292d0e9d169'
const ISAAC_SKETCHES_BASE = `https://github.com/isaac-mason/sketches/tree/${ISAAC_COMMIT}/sketches/rapier`

const mat = (color, extra = {}) => ({
  color,
  opacity: 1,
  transparent: false,
  wireframe: false,
  materialType: 'standard',
  metalness: 0.05,
  roughness: 0.7,
  ...extra,
})

function quatFromEuler(x, y, z) {
  const cx = Math.cos(x / 2)
  const sx = Math.sin(x / 2)
  const cy = Math.cos(y / 2)
  const sy = Math.sin(y / 2)
  const cz = Math.cos(z / 2)
  const sz = Math.sin(z / 2)
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ]
}

function quatY(angle) {
  const h = angle / 2
  return [0, Math.sin(h), 0, Math.cos(h)]
}

let idCounter = 0
let currentBlock = 0xe0100000

function eid(block = currentBlock) {
  idCounter += 1
  const hex = block.toString(16).padStart(8, '0')
  const seq = String(idCounter).padStart(12, '0')
  return `${hex}-0000-4000-8000-${seq}`
}

function entity(id, name, parent, components) {
  return { id, name, parent, components }
}

function transform(position, rotation = [0, 0, 0, 1], scale = [1, 1, 1]) {
  return { type: 'Transform', data: { position, rotation, scale } }
}

function camera(id, position, fov = 50) {
  return entity(id, 'MainCamera', null, [
    transform(position),
    { type: 'Camera', data: { fov, near: 0.1, far: 2000, enabled: true } },
  ])
}

function sun(id, position = [0, 20, 10]) {
  return entity(id, 'Sun', null, [
    transform(position, quatFromEuler(-0.5, 0.3, 0)),
    {
      type: 'Light',
      data: {
        type: 'directional',
        color: '#ffffff',
        intensity: 1.2,
        castShadow: true,
        enabled: true,
        localPosition: [0, 0, 0],
        targetPosition: [0, 0, -1],
      },
    },
  ])
}

function boxMesh(width, height, depth, color, opts = {}) {
  return {
    type: 'MeshRenderer',
    data: {
      geometryType: 'BoxGeometry',
      geometryParams: { width, height, depth },
      modelAsset: '',
      material: mat(color, opts),
      castShadow: true,
      receiveShadow: true,
      enabled: true,
    },
  }
}

function sphereMesh(radius, color, opts = {}) {
  return {
    type: 'MeshRenderer',
    data: {
      geometryType: 'SphereGeometry',
      geometryParams: { radius, widthSegments: 32, heightSegments: 16 },
      modelAsset: '',
      material: mat(color, opts),
      castShadow: true,
      receiveShadow: true,
      enabled: true,
    },
  }
}

function cylinderMesh(rTop, rBottom, height, color) {
  return {
    type: 'MeshRenderer',
    data: {
      geometryType: 'CylinderGeometry',
      geometryParams: { radiusTop: rTop, radiusBottom: rBottom, height, radialSegments: 32 },
      modelAsset: '',
      material: mat(color),
      castShadow: true,
      receiveShadow: true,
      enabled: true,
    },
  }
}

function torusMesh(radius, tube, color) {
  return {
    type: 'MeshRenderer',
    data: {
      geometryType: 'TorusGeometry',
      geometryParams: { radius, tube, radialSegments: 16, tubularSegments: 32 },
      modelAsset: '',
      material: mat(color),
      castShadow: true,
      receiveShadow: true,
      enabled: true,
    },
  }
}

function modelMesh(asset, color = '#ffffff') {
  return {
    type: 'MeshRenderer',
    data: {
      geometryType: 'ModelGeometry',
      geometryParams: {},
      modelAsset: asset,
      material: mat(color, { metalness: 0.15, roughness: 0.45 }),
      castShadow: true,
      receiveShadow: true,
      enabled: true,
    },
  }
}

function staticBox(position, halfExtents, color, rotation = [0, 0, 0, 1]) {
  const id = eid()
  const w = halfExtents[0] * 2
  const h = halfExtents[1] * 2
  const d = halfExtents[2] * 2
  return entity(id, 'StaticBox', null, [
    transform(position, rotation),
    boxMesh(w, h, d, color),
    {
      type: 'Collider',
      data: { shape: 'box', halfExtents, isStatic: true, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
  ])
}

function dynamicBox(position, halfExtents, color, _mass = 0.2, rotation = [0, 0, 0, 1]) {
  const id = eid()
  const w = halfExtents[0] * 2
  const h = halfExtents[1] * 2
  const d = halfExtents[2] * 2
  return entity(id, 'DynamicBox', null, [
    transform(position, rotation),
    boxMesh(w, h, d, color),
    {
      type: 'Collider',
      data: { shape: 'box', halfExtents, isStatic: false, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
  ])
}

function scene(name, cameraId, entities, renderSettings = null) {
  const doc = { schemaVersion: 1, metadata: { name, activeCameraId: cameraId }, entities }
  if (renderSettings) {
    doc.renderSettings = renderSettings
  }
  return doc
}

function isaacNightRenderSettings() {
  return {
    version: 1,
    features: { toneMapping: true, shadows: true, postProcessing: false, renderingLayers: false, renderTargets: false, fxaa: false, bloom: false, vignette: false },
    toneMapping: 'aces',
    toneMappingExposure: 1,
    outputColorSpace: 'srgb',
    background: { type: 'color', color: '#000000' },
    ambient: { color: '#ffffff', intensity: 0.3 },
    shadows: { enabled: true, quality: 'medium', type: 'pcf', mapSize: 1024, maxCasters: 8 },
  }
}

function hemisphereLight(id, intensity = 0.75) {
  return entity(id, 'HemisphereLight', null, [
    transform([0, 0, 0]),
    {
      type: 'Light',
      data: {
        type: 'hemisphere',
        color: '#ffffff',
        intensity,
        skyColor: '#1a1a28',
        groundColor: '#0a0a0a',
        enabled: true,
      },
    },
  ])
}

function spotLightEntity(name, localPosition, targetPosition, intensity, decay, outerAngleDeg) {
  return entity(eid(), name, null, [
    transform(localPosition),
    {
      type: 'Light',
      data: {
        type: 'spot',
        color: '#ffffff',
        intensity,
        distance: 40,
        decay,
        outerAngle: outerAngleDeg,
        innerAngle: outerAngleDeg * 0.85,
        castShadow: true,
        enabled: true,
        localPosition: [0, 0, 0],
        targetPosition: [
          targetPosition[0] - localPosition[0],
          targetPosition[1] - localPosition[1],
          targetPosition[2] - localPosition[2],
        ],
      },
    },
  ])
}

/** Isaac `LampPost` — pole, arm, fixture + spot (intensity 150, decay 1.5, angle 57°). */
function lampPost(worldPosition, rotationY = 0) {
  const rootId = eid()
  const rot = rotationY ? quatY(rotationY) : [0, 0, 0, 1]
  return [
    entity(rootId, `LampPost_${worldPosition.join('_')}`, null, [
      transform(worldPosition, rot),
      {
        type: 'Collider',
        data: { shape: 'box', halfExtents: [0.1, 5, 0.1], isStatic: true, offset: [0, 5, 0], rotation: [0, 0, 0, 1] },
      },
    ]),
    entity(eid(), 'Pole', rootId, [
      transform([0, 5, 0]),
      cylinderMesh(0.1, 0.1, 10, '#444444'),
    ]),
    entity(eid(), 'Arm', rootId, [
      transform([-0.4, 10, 0]),
      boxMesh(1.2, 0.2, 0.5, '#444444'),
    ]),
    entity(eid(), 'Fixture', rootId, [
      transform([-0.6, 9.89, 0], quatFromEuler(Math.PI / 2, 0, 0)),
      {
        type: 'MeshRenderer',
        data: {
          geometryType: 'PlaneGeometry',
          geometryParams: { width: 0.4, height: 0.2 },
          modelAsset: '',
          material: mat('#ffffff'),
          castShadow: false,
          receiveShadow: false,
          enabled: true,
        },
      },
    ]),
    (() => {
      const light = spotLightEntity('Spot', [-0.6, 10, 0], [-4, 0, 0], 150, 1.5, 57)
      light.parent = rootId
      return light
    })(),
  ]
}

function isaacModelMesh(asset) {
  return {
    type: 'MeshRenderer',
    data: {
      geometryType: 'ModelGeometry',
      geometryParams: {},
      modelAsset: asset,
      material: mat('#ffffff'),
      castShadow: true,
      receiveShadow: true,
      enabled: true,
    },
  }
}

/** custom-raycast-vehicle — 1:1 with Isaac sketch.tsx Game + Canvas */
function buildCustomRaycast() {
  currentBlock = 0xe0100000
  idCounter = 0
  const camId = eid()
  const vehicleId = eid()

  const lampPosts = [
    ...lampPost([10, 0, 0]),
    ...lampPost([-10, 0, 25], Math.PI),
    ...lampPost([10, 0, 50]),
    ...lampPost([-10, 0, 75], Math.PI),
    ...lampPost([10, 0, 100]),
  ]

  const entities = [
    // Canvas: camera fov 60, position [0, 30, -20] — chase cam takes over in Play
    camera(camId, [0, 30, -20], 60),
    hemisphereLight(eid()),
    ...lampPosts,
    entity(vehicleId, 'Vehicle', null, [
      transform([0, 5, 0]),
      {
        type: 'PhysicsController',
        data: {
          type: 'custom-raycast',
          enabled: true,
          chassis: {
            mass: 150,
            halfExtents: [1, 0.55, 2.35],
            lift: 0,
            angularDamping: 0.35,
            inertiaScale: 3,
          },
          wheels: {
            radius: 0.38,
            width: 0.32,
            halfWidth: 0.85,
            height: -0.3,
            halfLength: 1.35,
          },
          suspension: {
            stiffness: 30,
            restLength: 0.3,
            maxTravel: 0.3,
            frictionSlip: 1.4,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            rollInfluence: 0.01,
            sideFrictionStiffness: 1,
          },
          // Isaac Leva controls: maxForce 30, maxSteer 10, maxBrake 2 — no speed cap, no jump in sketch
          engine: { force: 30 },
          steering: { maxSteer: 10 },
          brakes: { brakeForce: 2 },
        },
      },
      isaacModelMesh('sketches/isaac-mason/chassis.glb'),
    ]),
    // Headlights — Isaac [2.4, -0.2, ±0.7] in X-forward → [±0.7, -0.2, 2.4] in +Z forward
    (() => {
      const l = spotLightEntity('HeadlightL', [0.7, -0.2, 2.4], [0.7, -0.2, 20], 20, 1, 46)
      l.parent = vehicleId
      return l
    })(),
    (() => {
      const l = spotLightEntity('HeadlightR', [-0.7, -0.2, 2.4], [-0.7, -0.2, 20], 20, 1, 46)
      l.parent = vehicleId
      return l
    })(),
    ...['frontLeft', 'frontRight', 'backLeft', 'backRight'].map((name) =>
      entity(eid(), name, vehicleId, [
        transform([0, 0, 0]),
        isaacModelMesh('sketches/isaac-mason/wheel.glb'),
      ]),
    ),
    staticBox([0, -5, 75], [120, 5, 120], '#303030'),
    staticBox([0, -1, 30], [5, 0.5, 5], 'orange', quatFromEuler(-0.3, 0, 0)),
    entity(eid(), 'CenterLane', null, [
      transform([0, 0.02, 50], quatFromEuler(-Math.PI / 2, 0, 0)),
      {
        type: 'MeshRenderer',
        data: {
          geometryType: 'PlaneGeometry',
          geometryParams: { width: 15, height: 150 },
          modelAsset: '',
          material: { ...mat('#222222'), transparent: false },
          castShadow: false,
          receiveShadow: true,
          enabled: true,
        },
      },
    ]),
    ...[
      [4, 1, 6],
      [2, 1, 8],
      [4, 1, 10],
      [-4, 1, 16],
      [-2, 1, 18],
      [-4, 1, 20],
    ].map(([x, y, z], i) =>
      entity(eid(), `Cone${i}`, null, [
        transform([x, y, z]),
        cylinderMesh(0.05, 0.3, 1, 'orange'),
        {
          type: 'Collider',
          data: { shape: 'capsule', radius: 0.25, halfHeight: 0.4, isStatic: false, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
        },
      ]),
    ),
    ...Array.from({ length: 6 }, (_, idx) => {
      const gx = idx % 2 === 0 ? -0.8 : 0.8
      const gz = 50 + idx * 1.5
      return staticBox([gx, -0.42, gz], [0.5, 1, 0.5], 'orange', quatFromEuler(0, 0, Math.PI / 2))
    }),
    ...Array.from({ length: 6 }, (_, idx) => dynamicBox([0, 2 + idx * 2.5, 70], [1, 0.5, 1], 'orange')),
  ]
  return scene('Isaac — Custom Raycast Vehicle', camId, entities, isaacNightRenderSettings())
}

/** dynamic-raycast-vehicle-controller */
function buildDynamicRaycast() {
  currentBlock = 0xe0200000
  idCounter = 0
  const camId = eid()
  const vehicleId = eid()
  const entities = [
    camera(camId, [0, 5, 10], 50),
    sun(eid()),
    staticBox([0, -0.5, 0], [300, 0.5, 300], '#444444'),
    entity(eid(), 'RacetrackVisual', null, [
      transform([-50, 0, -150], [0, 0, 0, 1], [0.6, 0.6, 0.6]),
      modelMesh('sketches/isaac-mason/racetrack.glb', '#cccccc'),
    ]),
    entity(vehicleId, 'Vehicle', null, [
      transform([-7, 2, -130], quatY(Math.PI / 2)),
      {
        type: 'PhysicsController',
        data: {
          type: 'dynamic-raycast',
          enabled: true,
          chassis: {
            mass: 250,
            halfExtents: [0.8, 0.2, 0.4],
            lift: 0.5,
            angularDamping: 0.35,
            inertiaScale: 3,
          },
          wheels: { radius: 0.15, width: 0.25, halfWidth: 0.65, height: -0.15, halfLength: 0.45 },
          suspension: {
            stiffness: 30,
            restLength: 0.55,
            maxTravel: 0.42,
            frictionSlip: 1.4,
            dampingRelaxation: 4.6,
            dampingCompression: 8.8,
            rollInfluence: 0.01,
            sideFrictionStiffness: 1,
          },
          accelerateForce: 2,
          brakeForce: 0.05,
          steerAngle: Math.PI / 24,
        },
      },
      boxMesh(1.6, 0.4, 0.8, '#ff6b6b'),
    ]),
  ]
  return scene('Isaac — Dynamic Raycast Vehicle', camId, entities)
}

/** arcade-vehicle-controller */
function buildArcadeVehicle() {
  currentBlock = 0xe0300000
  idCounter = 0
  const camId = eid()
  const boxLength = 20
  const trackWidth = 20
  const numConesInner = 15
  const numConesOuter = 60
  const innerR = boxLength / 2 - trackWidth
  const outerR = boxLength / 2 + trackWidth
  const coneColors = ['#ff922b', '#f06595', '#22b8cf']
  const cones = []
  for (let i = 0; i < numConesInner; i++) {
    const angle = (i / numConesInner) * Math.PI * 2
    cones.push([Math.cos(angle) * innerR, 1, Math.sin(angle) * innerR])
  }
  for (let i = 0; i < numConesOuter; i++) {
    const angle = (i / numConesOuter) * Math.PI * 2
    cones.push([Math.cos(angle) * outerR, 1, Math.sin(angle) * outerR])
  }

  const entities = [
    camera(camId, [0, 5, 10], 50),
    entity(eid(), 'PointLight', null, [
      transform([0, 5, 0]),
      { type: 'Light', data: { type: 'point', color: '#ffffff', intensity: 40, castShadow: false, enabled: true, localPosition: [0, 0, 0], targetPosition: [0, 0, 0] } },
    ]),
    staticBox([0, -1, 0], [100, 1, 100], '#888888'),
    entity(eid(), 'ArcadeVehicle', null, [
      transform([15, 2, 0]),
      {
        type: 'PhysicsController',
        data: {
          type: 'arcade-vehicle',
          enabled: true,
          maxForwardSpeed: 8,
          maxReverseSpeed: -1,
          jumpImpulse: 12,
          driftSteerRate: 0.01,
          speedLerp: 0.03,
          damping: 1.5,
        },
      },
      sphereMesh(0.7, '#ffd43b'),
      {
        type: 'Collider',
        data: { shape: 'sphere', radius: 0.7, isStatic: false, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
      },
    ]),
    ...cones.map(([x, y, z], i) =>
      entity(eid(), `Cone${i}`, null, [
        transform([x, y, z]),
        cylinderMesh(0.05, 0.3, 1, coneColors[i % 3]),
        {
          type: 'Collider',
          data: { shape: 'capsule', radius: 0.25, halfHeight: 0.4, isStatic: false, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
        },
      ]),
    ),
  ]
  return scene('Isaac — Arcade Vehicle', camId, entities)
}

/** kinematic-character-controller */
function buildKinematicCharacter() {
  currentBlock = 0xe0400000
  idCounter = 0
  const camId = eid()
  const playerId = eid()
  const entities = [
    camera(camId, [20, 7, -45], 75),
    sun(eid(), [30, 40, -40]),
    entity(eid(), 'GameLevelVisual', null, [
      transform([0, 0, 0], [0, 0, 0, 1], [0.01, 0.01, 0.01]),
      modelMesh('sketches/isaac-mason/game-level-transformed.glb', '#ffffff'),
    ]),
    staticBox([0, -1, 0], [200, 1, 200], '#555555'),
    entity(playerId, 'Player', null, [
      transform([20, 5, -50]),
      {
        type: 'PhysicsController',
        data: {
          type: 'kinematic-character',
          enabled: true,
          capsuleRadius: 0.5,
          capsuleHalfHeight: 1,
          moveSpeed: 1,
          sprintMultiplier: 1.5,
          snapToGroundDistance: 0.1,
          characterShapeOffset: 0.1,
          autoStepMaxHeight: 0.7,
          autoStepMinWidth: 0.3,
          autoStepIncludeDynamicBodies: true,
          applyImpulsesToDynamicBodies: true,
          accelerationTimeGrounded: 0.025,
          accelerationTimeAirborne: 0.2,
          velocityXZSmoothing: 0.2,
          velocityXZMin: 0.0001,
          maxJumpHeight: 4,
          minJumpHeight: 1,
          timeToJumpApex: 1,
        },
      },
      capsuleMesh(0.5, 2, '#74c0fc'),
    ]),
  ]
  return scene('Isaac — Kinematic Character', camId, entities)
}

function capsuleMesh(radius, length, color) {
  return {
    type: 'MeshRenderer',
    data: {
      geometryType: 'CapsuleGeometry',
      geometryParams: { radius, length, capSegments: 4, radialSegments: 8 },
      modelAsset: '',
      material: mat(color),
      castShadow: true,
      receiveShadow: true,
      enabled: true,
    },
  }
}

/** custom-spring */
function buildCustomSpring() {
  currentBlock = 0xe0500000
  idCounter = 0
  const camId = eid()
  const postId = eid()
  const ballId = eid()
  const entities = [
    camera(camId, [4, 4, 4], 50),
    sun(eid()),
    staticBox([0, -2, 0], [20, 1, 20], '#333333'),
    entity(postId, 'Post', null, [
      transform([0, 0, 0]),
      sphereMesh(0.1, '#999999'),
      {
        type: 'Collider',
        data: { shape: 'sphere', radius: 0.05, isStatic: true, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
      },
    ]),
    entity(ballId, 'Ball', null, [
      transform([0, 0, 0]),
      sphereMesh(1.2, 'orange', { wireframe: true }),
      {
        type: 'Collider',
        data: { shape: 'sphere', radius: 1.2, isStatic: false, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
      },
      {
        type: 'PhysicsController',
        data: {
          type: 'custom-spring',
          enabled: true,
          targetEntityId: postId,
          localAnchorA: [0, 1.2, 0],
          localAnchorB: [0, 0, 0],
          restLength: 1,
          stiffness: 50,
          damping: 10,
        },
      },
    ]),
  ]
  return scene('Isaac — Custom Spring', camId, entities)
}

/** pointer-controls */
function buildPointerControls() {
  currentBlock = 0xe0600000
  idCounter = 0
  const camId = eid()
  const cubeRot = quatFromEuler(-Math.PI / 8, -Math.PI / 8, 0)
  const draggable = (id, name, position, rotation, mesh, collider) =>
    entity(id, name, null, [
      transform(position, rotation),
      mesh,
      { type: 'Collider', data: collider },
      {
        type: 'PhysicsController',
        data: { type: 'pointer-controls', enabled: true, draggable: true, constraintType: 'spherical' },
      },
    ])

  const entities = [
    camera(camId, [4, 4, 4], 50),
    entity(eid(), 'PointLight', null, [
      transform([-10, 5, 10]),
      { type: 'Light', data: { type: 'point', color: '#ffffff', intensity: 100, castShadow: false, enabled: true, localPosition: [0, 0, 0], targetPosition: [0, 0, 0] } },
    ]),
    staticBox([0, -1, 0], [100, 1, 100], '#888888'),
    draggable(
      eid(),
      'Cube',
      [0, 5, 0],
      cubeRot,
      boxMesh(1.2, 1.2, 1.2, '#4dabf7'),
      { shape: 'box', halfExtents: [0.6, 0.6, 0.6], isStatic: false, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
    ),
    draggable(
      eid(),
      'Torus',
      [-2, 5, 2],
      [0, 0, 0, 1],
      torusMesh(0.6, 0.2, '#ffd43b'),
      { shape: 'sphere', radius: 0.75, isStatic: false, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
    ),
    draggable(
      eid(),
      'Sphere',
      [2, 5, -2],
      [0, 0, 0, 1],
      sphereMesh(0.6, '#ff6b6b'),
      { shape: 'sphere', radius: 0.6, isStatic: false, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
    ),
  ]
  return scene('Isaac — Pointer Controls', camId, entities)
}

/** revolute-joint-vehicle */
function buildRevoluteJointVehicle() {
  currentBlock = 0xe0700000
  idCounter = 0
  const camId = eid()
  const vehicleId = eid()

  let seed = 42
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const randBetween = (a, b) => rand() * (b - a) + a
  const spherePositions = Array.from({ length: 5 }, () => [
    randBetween(-5, -20),
    randBetween(1, 5),
    randBetween(-5, 5),
  ])
  const sphereRadii = Array.from({ length: 5 }, () => randBetween(0.5, 1.2))

  const entities = [
    camera(camId, [30, 30, 0], 60),
    sun(eid(), [-10, 30, 20]),
    staticBox([0, -2, 0], [75, 1, 75], '#444444'),
    entity(vehicleId, 'RevoluteVehicle', null, [
      transform([0, 1, 0]),
      {
        type: 'PhysicsController',
        data: {
          type: 'revolute-joint-vehicle',
          enabled: true,
          chassis: { mass: 5, halfExtents: [1.75, 0.25, 0.75], lift: 0.5, angularDamping: 0.35, inertiaScale: 3 },
          wheels: [
            { axlePosition: [-1.2, -0.6, 0.7], wheelPosition: [-1.2, -0.6, 1], isSteered: true, isDriven: false },
            { axlePosition: [-1.2, -0.6, -0.7], wheelPosition: [-1.2, -0.6, -1], isSteered: true, isDriven: false },
            { axlePosition: [1.2, -0.6, 0.7], wheelPosition: [1.2, -0.6, 1], isSteered: false, isDriven: true },
            { axlePosition: [1.2, -0.6, -0.7], wheelPosition: [1.2, -0.6, -1], isSteered: false, isDriven: true },
          ],
          wheelRadius: 0.125,
          wheelHalfHeight: 0.125,
          drivenTargetVelocity: 1000,
          drivenFactor: 10,
          steerAngle: 0.6,
          steerStiffness: 100,
          steerDamping: 10,
        },
      },
      boxMesh(3.5, 0.5, 1.5, '#339af0'),
    ]),
    ...Array.from({ length: 12 }, (_, idx) =>
      dynamicBox([-28, 0.2, 11 - idx * 2], [0.5, 1, 0.5], 'orange'),
    ),
    ...spherePositions.map(([x, y, z], idx) => {
      const r = sphereRadii[idx]
      return entity(eid(), `Sphere${idx}`, null, [
        transform([x, y, z]),
        sphereMesh(r, 'orange'),
        {
          type: 'Collider',
          data: { shape: 'sphere', radius: r, isStatic: false, offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
        },
      ])
    }),
  ]
  return scene('Isaac — Revolute Joint Vehicle', camId, entities)
}

const SCENES = [
  ['custom-raycast-vehicle', buildCustomRaycast],
  ['dynamic-raycast-vehicle-controller', buildDynamicRaycast],
  ['arcade-vehicle-controller', buildArcadeVehicle],
  ['kinematic-character-controller', buildKinematicCharacter],
  ['custom-spring', buildCustomSpring],
  ['pointer-controls', buildPointerControls],
  ['revolute-joint-vehicle', buildRevoluteJointVehicle],
]

async function writeManifest(assetsRoot) {
  const files = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'manifest.json') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else files.push(relative(assetsRoot, full).split('\\').join('/'))
    }
  }
  await walk(assetsRoot)
  files.sort((a, b) => a.localeCompare(b))
  await writeFile(join(assetsRoot, 'manifest.json'), `${JSON.stringify({ files }, null, 2)}\n`)
  return files.length
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  for (const [slug, builder] of SCENES) {
    const doc = builder()
    const path = join(OUT_DIR, `${slug}.scene.json`)
    await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`)
    console.log(`Wrote ${relative(ROOT, path)} (${doc.entities.length} entities)`)
  }
  const count = await writeManifest(ASSETS_ROOT)
  console.log(`Updated manifest.json (${count} files)`)
  console.log(`Source: ${ISAAC_SKETCHES_BASE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
