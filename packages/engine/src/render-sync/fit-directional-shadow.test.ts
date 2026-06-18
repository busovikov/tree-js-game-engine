import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  computeMeshWorldBounds,
  fitDirectionalShadowCamera,
  getDirectionalLightWorldDirection,
} from './fit-directional-shadow.js'

function setupDirectionalLight(): {
  scene: THREE.Scene
  group: THREE.Group
  light: THREE.DirectionalLight
  target: THREE.Object3D
} {
  const scene = new THREE.Scene()
  const group = new THREE.Group()
  group.position.set(5, 10, 5)

  const light = new THREE.DirectionalLight(0xffffff, 1)
  const target = new THREE.Object3D()
  target.position.set(0, 0, -1)
  group.add(light)
  group.add(target)
  light.target = target
  scene.add(group)
  scene.updateMatrixWorld(true)

  return { scene, group, light, target }
}

describe('fitDirectionalShadowCamera', () => {
  it('covers mesh bounds spanning negative coordinates', () => {
    const { scene, light } = setupDirectionalLight()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1, 2),
      new THREE.MeshStandardMaterial(),
    )
    mesh.position.set(-4, 0, -3)
    scene.add(mesh)
    scene.updateMatrixWorld(true)

    const bounds = computeMeshWorldBounds(scene)
    fitDirectionalShadowCamera(light, bounds)

    expect(bounds.min.x).toBeLessThan(0)
    expect(bounds.min.z).toBeLessThan(0)

    const cam = light.shadow.camera
    expect(cam.right - cam.left).toBe(cam.top - cam.bottom)
    expect(cam.right - cam.left).toBeGreaterThan(0)
  })

  it('does not move light target when bounds center shifts', () => {
    const { scene, light, target } = setupDirectionalLight()

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    )
    scene.add(cube)

    cube.position.set(0, 0, 0)
    scene.updateMatrixWorld(true)
    const dirA = getDirectionalLightWorldDirection(light).clone()
    const targetLocalA = target.position.clone()
    fitDirectionalShadowCamera(light, computeMeshWorldBounds(scene))

    cube.position.set(20, 0, 15)
    scene.updateMatrixWorld(true)
    const dirB = getDirectionalLightWorldDirection(light).clone()
    const targetLocalB = target.position.clone()
    fitDirectionalShadowCamera(light, computeMeshWorldBounds(scene))

    expect(targetLocalB.x).toBeCloseTo(targetLocalA.x, 6)
    expect(targetLocalB.y).toBeCloseTo(targetLocalA.y, 6)
    expect(targetLocalB.z).toBeCloseTo(targetLocalA.z, 6)
    expect(dirB.x).toBeCloseTo(dirA.x, 5)
    expect(dirB.y).toBeCloseTo(dirA.y, 5)
    expect(dirB.z).toBeCloseTo(dirA.z, 5)
  })

  it('keeps stable light direction with large plane and moving cube', () => {
    const { scene, light } = setupDirectionalLight()

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial(),
    )
    plane.rotation.x = -Math.PI / 2
    plane.scale.setScalar(1000)
    plane.receiveShadow = true
    scene.add(plane)

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    )
    cube.castShadow = true
    scene.add(cube)

    const directions: THREE.Vector3[] = []

    for (const x of [0, 10, -10, 25]) {
      cube.position.set(x, 0.5, x)
      scene.updateMatrixWorld(true)
      fitDirectionalShadowCamera(light, computeMeshWorldBounds(scene))
      directions.push(getDirectionalLightWorldDirection(light).clone())
    }

    for (let i = 1; i < directions.length; i++) {
      expect(directions[i]!.x).toBeCloseTo(directions[0]!.x, 5)
      expect(directions[i]!.y).toBeCloseTo(directions[0]!.y, 5)
      expect(directions[i]!.z).toBeCloseTo(directions[0]!.z, 5)
    }
  })

  it('positions shadow camera at bounds center without rotating the light', () => {
    const { scene, light } = setupDirectionalLight()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    )
    mesh.position.set(3, 0, -7)
    scene.add(mesh)
    scene.updateMatrixWorld(true)

    const bounds = computeMeshWorldBounds(scene)
    fitDirectionalShadowCamera(light, bounds)

    const center = bounds.getCenter(new THREE.Vector3())
    expect(light.shadow.camera.position.x).toBeCloseTo(center.x, 3)
    expect(light.shadow.camera.position.z).toBeCloseTo(center.z, 3)
  })
})

describe('computeMeshWorldBounds', () => {
  it('includes scaled plane in world bounds', () => {
    const scene = new THREE.Scene()
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial(),
    )
    plane.rotation.x = -Math.PI / 2
    plane.scale.setScalar(1000)
    scene.add(plane)
    scene.updateMatrixWorld(true)

    const bounds = computeMeshWorldBounds(scene)
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(500)
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(500)
  })
})
