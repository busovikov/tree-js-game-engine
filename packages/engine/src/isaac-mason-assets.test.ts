import { describe, expect, it } from 'vitest'
import {
  fitIsaacMasonChassisModel,
  fitIsaacMasonWheelModel,
  ISAAC_CHASSIS_HALF_HEIGHT,
  ISAAC_CHASSIS_HALF_LENGTH,
  ISAAC_CHASSIS_HALF_WIDTH,
  ISAAC_WHEEL_REFERENCE_RADIUS,
} from './vehicle-model-fit.js'
import { loadPlaygroundGltfScene, objectSize, repoPlaygroundAssetPath } from './isaac-gltf-test-utils.js'
import { existsSync } from 'node:fs'

const HAS_ASSETS = existsSync(repoPlaygroundAssetPath('sketches/isaac-mason/wheel.glb'))

describe.skipIf(!HAS_ASSETS)('Isaac Mason GLBs', () => {
  it('loads wheel.glb', async () => {
    const scene = await loadPlaygroundGltfScene('sketches/isaac-mason/wheel.glb')
    expect(scene.children.length).toBeGreaterThan(0)
    const size = objectSize(scene)
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.1)
  })

  it('loads chassis.glb', async () => {
    const scene = await loadPlaygroundGltfScene('sketches/isaac-mason/chassis.glb')
    expect(scene.children.length).toBeGreaterThan(0)
    const size = objectSize(scene)
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(1)
  })

  it('fits wheel to Isaac radius with left mirror', async () => {
    const scene = await loadPlaygroundGltfScene('sketches/isaac-mason/wheel.glb')
    const left = fitIsaacMasonWheelModel(scene.clone(true), {
      radius: ISAAC_WHEEL_REFERENCE_RADIUS,
      side: 'left',
    })
    const right = fitIsaacMasonWheelModel(scene.clone(true), {
      radius: ISAAC_WHEEL_REFERENCE_RADIUS,
      side: 'right',
    })

    const leftSize = objectSize(left)
    const rightSize = objectSize(right)
    const targetDiameter = ISAAC_WHEEL_REFERENCE_RADIUS * 2

    expect(Math.max(leftSize.y, leftSize.z)).toBeCloseTo(targetDiameter, 2)
    expect(Math.max(rightSize.y, rightSize.z)).toBeCloseTo(targetDiameter, 2)
    expect(left.scale.x).toBe(1)
    expect(left.children[0]?.scale.x).toBe(-1)
    expect(left.children[0]?.scale.y).toBe(-1)
    expect(left.children[0]?.scale.z).toBe(-1)
    expect(right.children[0]?.scale.x).toBe(1)
  })

  it('fits chassis to Isaac cuboid mapped to Haku +Z forward', async () => {
    const scene = await loadPlaygroundGltfScene('sketches/isaac-mason/chassis.glb')
    const fitted = fitIsaacMasonChassisModel(scene)
    const size = objectSize(fitted)

    expect(size.x).toBeCloseTo(ISAAC_CHASSIS_HALF_WIDTH * 2, 1)
    expect(size.y).toBeCloseTo(ISAAC_CHASSIS_HALF_HEIGHT * 2, 1)
    expect(size.z).toBeCloseTo(ISAAC_CHASSIS_HALF_LENGTH * 2, 1)
  })

  it('removes embedded chassis wheel placeholders (Isaac uses separate wheel.glb)', async () => {
    const scene = await loadPlaygroundGltfScene('sketches/isaac-mason/chassis.glb')
    const before: string[] = []
    scene.traverse((obj) => {
      if (obj.name && /^Wheel/i.test(obj.name)) {
        before.push(obj.name)
      }
    })
    expect(before.length).toBeGreaterThan(0)

    const fitted = fitIsaacMasonChassisModel(scene.clone(true))
    const after: string[] = []
    fitted.traverse((obj) => {
      if (obj.name && /^Wheel/i.test(obj.name)) {
        after.push(obj.name)
      }
    })
    expect(after).toEqual([])
  })
})
