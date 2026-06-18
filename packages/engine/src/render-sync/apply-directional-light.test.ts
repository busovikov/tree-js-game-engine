import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  LIGHT_DEFAULT_LOCAL_POSITION,
  LIGHT_DEFAULT_TARGET_POSITION,
} from '@haku/schema'
import {
  applyDirectionalLightPose,
  getDirectionalLightWorldDirection,
} from './apply-directional-light.js'

function makeDirectionalGroup(
  localPosition: [number, number, number],
  targetPosition: [number, number, number],
): { group: THREE.Group; light: THREE.DirectionalLight } {
  const group = new THREE.Group()
  const light = new THREE.DirectionalLight(0xffffff, 1)
  const target = new THREE.Object3D()
  group.add(light)
  group.add(target)
  light.target = target
  applyDirectionalLightPose(light, localPosition, targetPosition)
  group.updateMatrixWorld(true)
  return { group, light }
}

describe('applyDirectionalLightPose', () => {
  it('applies serialized local position and target from schema defaults', () => {
    const { light } = makeDirectionalGroup(
      LIGHT_DEFAULT_LOCAL_POSITION,
      LIGHT_DEFAULT_TARGET_POSITION,
    )
    expect(light.position.toArray()).toEqual([...LIGHT_DEFAULT_LOCAL_POSITION])
    expect(light.target.position.toArray()).toEqual([...LIGHT_DEFAULT_TARGET_POSITION])
  })

  it('derives world direction from configured pose and entity rotation', () => {
    const { group, light } = makeDirectionalGroup(
      LIGHT_DEFAULT_LOCAL_POSITION,
      LIGHT_DEFAULT_TARGET_POSITION,
    )
    group.rotation.set(-Math.PI / 4, 0.2, 0)
    group.updateMatrixWorld(true)

    const dir = getDirectionalLightWorldDirection(light)
    const localDir = new THREE.Vector3(
      LIGHT_DEFAULT_TARGET_POSITION[0] - LIGHT_DEFAULT_LOCAL_POSITION[0],
      LIGHT_DEFAULT_TARGET_POSITION[1] - LIGHT_DEFAULT_LOCAL_POSITION[1],
      LIGHT_DEFAULT_TARGET_POSITION[2] - LIGHT_DEFAULT_LOCAL_POSITION[2],
    ).normalize()
    const expected = localDir.applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()))

    expect(dir.x).toBeCloseTo(expected.x, 5)
    expect(dir.y).toBeCloseTo(expected.y, 5)
    expect(dir.z).toBeCloseTo(expected.z, 5)
  })

  it('supports custom local pose independent of Three.js constructor defaults', () => {
    const localPosition: [number, number, number] = [0, 2, 0]
    const targetPosition: [number, number, number] = [0, 0, 0]
    const { group, light } = makeDirectionalGroup(localPosition, targetPosition)
    group.rotation.set(0, 0, 0)
    group.updateMatrixWorld(true)

    const dir = getDirectionalLightWorldDirection(light)
    expect(dir.x).toBeCloseTo(0, 5)
    expect(dir.y).toBeCloseTo(-1, 5)
    expect(dir.z).toBeCloseTo(0, 5)
  })
})
