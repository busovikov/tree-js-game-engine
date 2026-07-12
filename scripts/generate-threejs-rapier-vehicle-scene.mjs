/**
 * Three.js example — physics_rapier_vehicle_controller.html (1:1 layout & controller params).
 * https://threejs.org/examples/physics_rapier_vehicle_controller.html
 *
 * Run: node scripts/generate-threejs-rapier-vehicle-scene.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const OUT_DIR = join(ROOT, 'apps/playground/public/assets/scenes/demos/threejs')
const SOURCE_URL =
  'https://threejs.org/examples/physics_rapier_vehicle_controller.html'

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

let idCounter = 0
function eid() {
  idCounter += 1
  return `e0a00000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`
}

function entity(id, name, parent, components) {
  return { id, name, parent, components }
}

function transform(position, rotation = [0, 0, 0, 1], scale = [1, 1, 1]) {
  return { type: 'Transform', data: { position, rotation, scale } }
}

function buildScene() {
  const camId = eid()
  const vehicleId = eid()
  const suspensionRestLength = 0.8
  const wheelY = -suspensionRestLength
  const wheelRot = quatFromEuler(0, 0, Math.PI / 2)

  const entities = [
    entity(camId, 'MainCamera', null, [
      transform([0, 4, 10]),
      { type: 'Camera', data: { fov: 60, near: 0.1, far: 100, enabled: true } },
    ]),
    entity(eid(), 'HemisphereLight', null, [
      transform([0, 0, 0]),
      {
        type: 'Light',
        data: {
          type: 'hemisphere',
          color: '#ffffff',
          intensity: 1,
          skyColor: '#555555',
          groundColor: '#ffffff',
          enabled: true,
        },
      },
    ]),
    entity(eid(), 'Sun', null, [
      transform([0, 12.5, 12.5], quatFromEuler(-0.5, 0, 0)),
      {
        type: 'Light',
        data: {
          type: 'directional',
          color: '#ffffff',
          intensity: 4,
          castShadow: true,
          enabled: true,
          localPosition: [0, 0, 0],
          targetPosition: [0, -1, -1],
        },
      },
    ]),
    entity(eid(), 'Ground', null, [
      transform([0, -0.25, -20]),
      {
        type: 'MeshRenderer',
        data: {
          geometryType: 'BoxGeometry',
          geometryParams: { width: 100, height: 0.5, depth: 100 },
          modelAsset: '',
          material: mat('#ffffff'),
          castShadow: false,
          receiveShadow: true,
          enabled: true,
        },
      },
      {
        type: 'Collider',
        data: {
          shape: 'box',
          halfExtents: [50, 0.25, 50],
          isStatic: true,
          offset: [0, 0, 0],
          rotation: [0, 0, 0, 1],
        },
      },
    ]),
    entity(vehicleId, 'Car', null, [
      transform([0, 1, 0]),
      {
        type: 'PhysicsController',
        data: {
          type: 'dynamic-raycast',
          enabled: true,
          driveProfile: 'threejs-rapier',
          chassis: {
            mass: 10,
            halfExtents: [1, 0.5, 2],
            lift: 0,
          },
          wheels: {
            radius: 0.3,
            width: 0.4,
            halfWidth: 1,
            height: 0,
            halfLength: 1.5,
          },
          suspension: {
            stiffness: 24,
            restLength: suspensionRestLength,
            frictionSlip: 1000,
          },
          accelerateForceMin: -30,
          accelerateForceMax: 30,
          accelerateForceStep: 1,
          brakeForceMax: 1,
          brakeForceStep: 0.05,
          steerAngleMax: Math.PI / 4,
          steerLerp: 0.25,
        },
      },
      {
        type: 'MeshRenderer',
        data: {
          geometryType: 'BoxGeometry',
          geometryParams: { width: 2, height: 1, depth: 4 },
          modelAsset: '',
          material: mat('#ff0000'),
          castShadow: true,
          receiveShadow: true,
          enabled: true,
        },
      },
    ]),
    ...[
      ['frontLeft', [-1, wheelY, 1.5]],
      ['frontRight', [1, wheelY, 1.5]],
      ['backLeft', [-1, wheelY, -1.5]],
      ['backRight', [1, wheelY, -1.5]],
    ].map(([name, pos]) =>
      entity(eid(), name, vehicleId, [
        transform(pos, wheelRot),
        {
          type: 'MeshRenderer',
          data: {
            geometryType: 'CylinderGeometry',
            geometryParams: {
              radiusTop: 0.3,
              radiusBottom: 0.3,
              height: 0.4,
              radialSegments: 16,
            },
            modelAsset: '',
            material: mat('#000000'),
            castShadow: true,
            receiveShadow: true,
            enabled: true,
          },
        },
      ]),
    ),
  ]

  return {
    schemaVersion: 1,
    metadata: {
      name: 'Three.js — Rapier Vehicle Controller',
      activeCameraId: camId,
      sourceUrl: SOURCE_URL,
    },
    renderSettings: {
      version: 1,
      features: {
        toneMapping: true,
        shadows: true,
        postProcessing: false,
        renderingLayers: false,
        renderTargets: false,
        fxaa: false,
        bloom: false,
        vignette: false,
      },
      toneMapping: 'aces',
      toneMappingExposure: 1,
      outputColorSpace: 'srgb',
      background: { type: 'color', color: '#bfd1e5' },
      ambient: { color: '#ffffff', intensity: 0.15 },
      shadows: { enabled: true, quality: 'high', type: 'pcf', mapSize: 2048, maxCasters: 8 },
    },
    entities,
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const doc = buildScene()
  const path = join(OUT_DIR, 'rapier-vehicle-controller.scene.json')
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`Wrote ${relative(ROOT, path)} (${doc.entities.length} entities)`)
  console.log(`Source: ${SOURCE_URL}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
