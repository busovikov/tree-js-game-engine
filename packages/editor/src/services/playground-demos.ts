import type { HakuProject } from '@haku/schema'

/** Virtual playground project used when opening built-in demo scenes. */
export const PLAYGROUND_PROJECT: HakuProject = {
  name: 'playground',
  entryScene: 'public/assets/scenes/menu.scene.json',
  assetsDir: 'public/assets',
  scriptsDir: 'scripts',
}

const ISAAC_COMMIT = '1d474e6713a972c76dcabe8c8b074292d0e9d169'
const ISAAC_SKETCHES_BASE = `https://github.com/isaac-mason/sketches/tree/${ISAAC_COMMIT}/sketches/rapier`

const THREEJS_RAPIER_VEHICLE_URL =
  'https://threejs.org/examples/physics_rapier_vehicle_controller.html'

export interface PlaygroundDemoScene {
  id: string
  label: string
  scenePath: string
  hint: string
  /** Upstream reference URL (Isaac sketch or Three.js example). */
  sourceUrl: string
}

/** Built-in Isaac Mason Rapier sketch scenes (generated under demos/isaac/). */
export const PLAYGROUND_DEMO_SCENES: readonly PlaygroundDemoScene[] = [
  {
    id: 'threejs-rapier-vehicle',
    label: 'Three.js Rapier Vehicle',
    scenePath: 'public/assets/scenes/demos/threejs/rapier-vehicle-controller.scene.json',
    hint: 'Three.js physics_rapier_vehicle_controller — red box car, white ground. WASD, Space brake, R reset.',
    sourceUrl: THREEJS_RAPIER_VEHICLE_URL,
  },
  {
    id: 'custom-raycast',
    label: 'Custom Raycast Vehicle',
    scenePath: 'public/assets/scenes/demos/isaac/custom-raycast-vehicle.scene.json',
    hint: 'Isaac custom-raycast-vehicle — WASD drive, Space brake. Ground, ramp, bumps, cones, lamp posts.',
    sourceUrl: `${ISAAC_SKETCHES_BASE}/custom-raycast-vehicle`,
  },
  {
    id: 'dynamic-raycast',
    label: 'Dynamic Raycast Vehicle',
    scenePath: 'public/assets/scenes/demos/isaac/dynamic-raycast-vehicle-controller.scene.json',
    hint: 'Isaac dynamic-raycast — spawn on OOB floor; racetrack GLB is visual (trimesh collider pending).',
    sourceUrl: `${ISAAC_SKETCHES_BASE}/dynamic-raycast-vehicle-controller`,
  },
  {
    id: 'arcade-vehicle',
    label: 'Arcade Vehicle',
    scenePath: 'public/assets/scenes/demos/isaac/arcade-vehicle-controller.scene.json',
    hint: 'Isaac arcade-vehicle — ball body at [15,2,0], 75 cones on oval track. WASD + Space jump/drift.',
    sourceUrl: `${ISAAC_SKETCHES_BASE}/arcade-vehicle-controller`,
  },
  {
    id: 'kinematic-character',
    label: 'Kinematic Character',
    scenePath: 'public/assets/scenes/demos/isaac/kinematic-character-controller.scene.json',
    hint: 'Isaac kinematic-character — player at [20,5,-50], game-level GLB visual. Flat collision proxy until trimesh.',
    sourceUrl: `${ISAAC_SKETCHES_BASE}/kinematic-character-controller`,
  },
  {
    id: 'custom-spring',
    label: 'Custom Spring',
    scenePath: 'public/assets/scenes/demos/isaac/custom-spring.scene.json',
    hint: 'Isaac custom-spring — fixed post + dynamic sphere (r=1.2, mass 5), rest 1 / stiffness 50 / damping 10.',
    sourceUrl: `${ISAAC_SKETCHES_BASE}/custom-spring`,
  },
  {
    id: 'pointer-controls',
    label: 'Pointer Controls',
    scenePath: 'public/assets/scenes/demos/isaac/pointer-controls.scene.json',
    hint: 'Isaac pointer-controls — click cube, torus, or sphere in Play mode to drag with spherical joints.',
    sourceUrl: `${ISAAC_SKETCHES_BASE}/pointer-controls`,
  },
  {
    id: 'revolute-joint-vehicle',
    label: 'Revolute Joint Vehicle',
    scenePath: 'public/assets/scenes/demos/isaac/revolute-joint-vehicle.scene.json',
    hint: 'Isaac revolute-joint-vehicle — chassis at [0,1,0], 12 boxes, 5 spheres (seeded layout). WASD drive.',
    sourceUrl: `${ISAAC_SKETCHES_BASE}/revolute-joint-vehicle`,
  },
] as const

export function findPlaygroundDemo(scenePath: string): PlaygroundDemoScene | undefined {
  return PLAYGROUND_DEMO_SCENES.find((demo) => demo.scenePath === scenePath)
}
