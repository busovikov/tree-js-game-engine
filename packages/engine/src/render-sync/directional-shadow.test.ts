import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { computeCameraShadowAnchor, updateDirectionalShadowRig } from './directional-shadow.js'

function makeLightGroup(): { group: THREE.Group; light: THREE.DirectionalLight } {
  const scene = new THREE.Scene()
  const group = new THREE.Group()
  const light = new THREE.DirectionalLight(0xffffff, 1)
  const target = new THREE.Object3D()
  target.position.set(0, 0, -1)
  group.add(light)
  group.add(target)
  light.target = target
  scene.add(group)
  scene.updateMatrixWorld(true)
  return { group, light }
}

function worldDirection(light: THREE.DirectionalLight): THREE.Vector3 {
  const lightPos = light.getWorldPosition(new THREE.Vector3())
  const targetPos = light.target.getWorldPosition(new THREE.Vector3())
  return targetPos.sub(lightPos).normalize()
}

const config = { size: 60, distance: 100 }

describe('updateDirectionalShadowRig', () => {
  it('sizes the ortho frustum from config, not scene contents', () => {
    const { light } = makeLightGroup()
    updateDirectionalShadowRig(light, config)

    const cam = light.shadow.camera
    expect(cam.right - cam.left).toBe(60)
    expect(cam.top - cam.bottom).toBe(60)
  })

  it('keeps shadow independent of the light entity position', () => {
    const { group, light } = makeLightGroup()
    group.rotation.set(-0.6, 0.4, 0)

    group.position.set(0, 0, 0)
    group.updateMatrixWorld(true)
    updateDirectionalShadowRig(light, config)
    const camPosA = light.getWorldPosition(new THREE.Vector3()).clone()
    const dirA = worldDirection(light).clone()

    group.position.set(250, 80, -130)
    group.updateMatrixWorld(true)
    updateDirectionalShadowRig(light, config)
    const camPosB = light.getWorldPosition(new THREE.Vector3()).clone()
    const dirB = worldDirection(light).clone()

    expect(camPosB.x).toBeCloseTo(camPosA.x, 5)
    expect(camPosB.y).toBeCloseTo(camPosA.y, 5)
    expect(camPosB.z).toBeCloseTo(camPosA.z, 5)
    expect(dirB.x).toBeCloseTo(dirA.x, 5)
    expect(dirB.y).toBeCloseTo(dirA.y, 5)
    expect(dirB.z).toBeCloseTo(dirA.z, 5)
  })

  it('derives the lit direction from orientation only', () => {
    const { group, light } = makeLightGroup()
    group.rotation.set(-Math.PI / 4, 0, 0)
    group.position.set(17, 42, -9)
    group.updateMatrixWorld(true)

    updateDirectionalShadowRig(light, config)

    const dir = worldDirection(light)
    const expected = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()))
      .normalize()
    expect(dir.x).toBeCloseTo(expected.x, 5)
    expect(dir.y).toBeCloseTo(expected.y, 5)
    expect(dir.z).toBeCloseTo(expected.z, 5)
  })

  it('centres the shadow volume on the world origin', () => {
    const { group, light } = makeLightGroup()
    group.rotation.set(-1, 0.3, 0)
    group.position.set(60, 20, 60)
    group.updateMatrixWorld(true)

    updateDirectionalShadowRig(light, config)

    const camPos = light.getWorldPosition(new THREE.Vector3())
    const dir = worldDirection(light)
    const volumeCentre = camPos.clone().addScaledVector(dir, config.distance)
    expect(volumeCentre.length()).toBeCloseTo(0, 4)
  })

  it('centres the shadow volume on the provided anchor (camera-following)', () => {
    const { group, light } = makeLightGroup()
    group.rotation.set(-0.9, 0.2, 0)
    group.updateMatrixWorld(true)

    const anchor = new THREE.Vector3(120, 0, -45)
    updateDirectionalShadowRig(light, { ...config, anchor })

    const camPos = light.getWorldPosition(new THREE.Vector3())
    const dir = worldDirection(light)
    const volumeCentre = camPos.clone().addScaledVector(dir, config.distance)
    expect(volumeCentre.x).toBeCloseTo(anchor.x, 3)
    expect(volumeCentre.y).toBeCloseTo(anchor.y, 3)
    expect(volumeCentre.z).toBeCloseTo(anchor.z, 3)
  })

  it('snaps the anchor to the texel grid to avoid shimmering', () => {
    const { group, light } = makeLightGroup()
    group.rotation.set(-Math.PI / 2, 0, 0) // straight down: view plane is world XZ
    group.updateMatrixWorld(true)

    // size 64 / mapSize 64 => 1 unit texels; an off-grid anchor should snap.
    const anchor = new THREE.Vector3(10.3, 0, -7.8)
    updateDirectionalShadowRig(light, { size: 64, distance: 100, mapSize: 64, anchor })

    const camPos = light.getWorldPosition(new THREE.Vector3())
    const dir = worldDirection(light)
    const volumeCentre = camPos.clone().addScaledVector(dir, 100)
    expect(volumeCentre.x).toBeCloseTo(10, 3)
    expect(volumeCentre.z).toBeCloseTo(-8, 3)
  })
})

describe('computeCameraShadowAnchor', () => {
  it('returns a point ahead of the camera along its look direction', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 5, 20)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)

    const anchor = computeCameraShadowAnchor(camera, 40)
    // Forward is roughly toward origin, so the anchor sits between camera and target.
    expect(anchor.z).toBeLessThan(20)
    expect(anchor.length()).toBeLessThan(camera.position.length())
  })
})
