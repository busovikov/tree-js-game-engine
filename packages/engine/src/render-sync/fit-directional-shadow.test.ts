import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { computeMeshWorldBounds, fitDirectionalShadowCamera } from './fit-directional-shadow.js'

describe('fitDirectionalShadowCamera', () => {
  it('centers shadow frustum on mesh bounds spanning negative coordinates', () => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1, 2),
      new THREE.MeshStandardMaterial(),
    )
    mesh.position.set(-4, 0, -3)
    scene.add(mesh)

    const group = new THREE.Group()
    const light = new THREE.DirectionalLight(0xffffff, 1)
    const target = new THREE.Object3D()
    target.position.set(0, 0, -1)
    group.add(light)
    group.add(target)
    light.target = target
    scene.add(group)

    scene.updateMatrixWorld(true)

    const bounds = computeMeshWorldBounds(scene)
    fitDirectionalShadowCamera(light, bounds)

    expect(bounds.min.x).toBeLessThan(0)
    expect(bounds.min.z).toBeLessThan(0)

    const cam = light.shadow.camera
    expect(cam.left).toBeLessThan(0)
    expect(cam.right).toBeGreaterThan(0)
    expect(cam.bottom).toBeLessThan(0)
    expect(cam.top).toBeGreaterThan(0)
    expect(cam.right - cam.left).toBe(cam.top - cam.bottom)

    group.updateMatrixWorld(true)
    const targetWorld = new THREE.Vector3()
    light.target.getWorldPosition(targetWorld)
    const center = bounds.getCenter(new THREE.Vector3())
    expect(targetWorld.x).toBeCloseTo(center.x, 1)
    expect(targetWorld.z).toBeCloseTo(center.z, 1)
  })
})
