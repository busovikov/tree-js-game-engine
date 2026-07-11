import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  VEHICLE_BODY_TARGET_LENGTH,
  VEHICLE_CHASSIS_LIFT,
  VEHICLE_WHEEL_TARGET_DIAMETER,
  fitModelToTargetSize,
  fitVehicleBodyModel,
  fitVehicleWheelModel,
  isVehicleBodyModelAsset,
  isVehicleWheelModelAsset,
} from './vehicle-model-fit.js'

function boxMesh(size: [number, number, number]): THREE.Mesh {
  const [x, y, z] = size
  return new THREE.Mesh(new THREE.BoxGeometry(x, y, z))
}

describe('vehicle model fit helpers', () => {
  it('detects body and wheel asset paths', () => {
    expect(isVehicleBodyModelAsset('models/base.glb')).toBe(true)
    expect(isVehicleWheelModelAsset('models/front-left.glb')).toBe(true)
    expect(isVehicleWheelModelAsset('models/back-right.glb')).toBe(true)
    expect(isVehicleWheelModelAsset('models/base.glb')).toBe(false)
  })

  it('fitModelToTargetSize scales uniformly to target axis extent', () => {
    const mesh = boxMesh([1, 2, 0.5])
    const group = new THREE.Group()
    group.add(mesh)

    const fitted = fitModelToTargetSize(group, 0.5, 4)
    const size = new THREE.Box3().setFromObject(fitted).getSize(new THREE.Vector3())

    expect(size.z).toBeCloseTo(4, 4)
    expect(fitted.scale.x).toBeCloseTo(fitted.scale.y)
    expect(fitted.scale.y).toBeCloseTo(fitted.scale.z)
  })

  it('fitVehicleBodyModel targets chassis length and applies lift', () => {
    const mesh = boxMesh([0.2, 0.2, 0.269])
    const fitted = fitVehicleBodyModel(mesh)
    const size = new THREE.Box3().setFromObject(fitted).getSize(new THREE.Vector3())

    expect(size.z).toBeCloseTo(VEHICLE_BODY_TARGET_LENGTH, 3)
    expect(fitted.position.y).toBe(VEHICLE_CHASSIS_LIFT)
  })

  it('fitVehicleWheelModel targets tire diameter from max(y,z)', () => {
    const mesh = boxMesh([0.02, 0.055, 0.04])
    const fitted = fitVehicleWheelModel(mesh)
    const size = new THREE.Box3().setFromObject(fitted).getSize(new THREE.Vector3())

    expect(Math.max(size.y, size.z)).toBeCloseTo(VEHICLE_WHEEL_TARGET_DIAMETER, 3)
  })
})
