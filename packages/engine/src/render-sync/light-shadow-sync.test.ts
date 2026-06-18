import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { LightSchema, RenderSettingsSchema } from '@haku/schema'
import { LightComponent, TransformComponent, World } from '@haku/core'
import { RenderSyncSystem } from './render-sync-system.js'
import { getDirectionalLightWorldDirection } from './apply-directional-light.js'

function findDirectionalLight(object3d: THREE.Object3D): THREE.DirectionalLight | null {
  let found: THREE.DirectionalLight | null = null
  object3d.traverse((child) => {
    if (!found && child instanceof THREE.DirectionalLight) found = child
  })
  return found
}

describe('directional light shadow toggle restores component pose', () => {
  it('re-applies serialized local pose after shadows are disabled', () => {
    const localPosition: [number, number, number] = [0, 1.5, 0]
    const targetPosition: [number, number, number] = [0, 0, -2]

    const world = new World()
    const id = world.createEntity('Sun')
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.7, 0.3, 0))
    world.addComponent(id, TransformComponent, {
      position: [1, 8, 2],
      rotation: [quat.x, quat.y, quat.z, quat.w],
      scale: [1, 1, 1],
    })
    world.addComponent(
      id,
      LightComponent,
      LightSchema.parse({
        type: 'directional',
        intensity: 1,
        localPosition,
        targetPosition,
      }),
    )

    const scene = new THREE.Scene()
    const sync = new RenderSyncSystem(scene)
    sync.attach(world)

    const light = findDirectionalLight(sync.getObject3D(id)!)!
    const expectedDir = getDirectionalLightWorldDirection(light).clone()

    sync.setRenderSettings(
      RenderSettingsSchema.parse({
        features: { shadows: true },
        shadows: { enabled: true, followCamera: false },
      }),
    )
    sync.update(world)
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 4, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    sync.updateDirectionalShadowRigs(camera)
    scene.updateMatrixWorld(true)

    sync.setRenderSettings(RenderSettingsSchema.parse({}))
    sync.update(world)
    scene.updateMatrixWorld(true)

    expect(light.position.toArray()).toEqual(localPosition)
    expect(light.target.position.toArray()).toEqual(targetPosition)
    expect(getDirectionalLightWorldDirection(light).dot(expectedDir)).toBeCloseTo(1, 5)
  })
})
