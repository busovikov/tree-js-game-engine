import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  VEHICLE_BODY_TARGET_LENGTH,
  VEHICLE_CHASSIS_LIFT,
  VEHICLE_WHEEL_TARGET_DIAMETER,
  VEHICLE_WHEEL_YAW_OFFSET,
  fitModelToTargetSize,
  fitIsaacMasonWheelModel,
  fitVehicleBodyModel,
  fitVehicleWheelModel,
  inferIsaacWheelSide,
  ISAAC_WHEEL_REFERENCE_RADIUS,
  resolveVisualSteerAngle,
  isIsaacMasonChassisAsset,
  isIsaacMasonWheelAsset,
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
    expect(isIsaacMasonChassisAsset('sketches/isaac-mason/chassis-draco.glb')).toBe(true)
    expect(isVehicleWheelModelAsset('models/front-left.glb')).toBe(true)
    expect(isIsaacMasonWheelAsset('sketches/isaac-mason/wheel-draco.glb')).toBe(true)
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

  it('fitVehicleBodyModel targets chassis length, applies lift, and faces +Z', () => {
    const mesh = boxMesh([0.2, 0.2, 0.269])
    const fitted = fitVehicleBodyModel(mesh)
    const size = new THREE.Box3().setFromObject(fitted).getSize(new THREE.Vector3())

    expect(size.z).toBeCloseTo(VEHICLE_BODY_TARGET_LENGTH, 3)
    expect(fitted.position.y).toBe(VEHICLE_CHASSIS_LIFT)
    expect(fitted.rotation.y).toBeCloseTo(Math.PI, 5)
  })

  it('fitVehicleWheelModel targets tire diameter from max(y,z) and faces +Z', () => {
    const mesh = boxMesh([0.02, 0.055, 0.04])
    const fitted = fitVehicleWheelModel(mesh)
    const size = new THREE.Box3().setFromObject(fitted).getSize(new THREE.Vector3())

    expect(Math.max(size.y, size.z)).toBeCloseTo(VEHICLE_WHEEL_TARGET_DIAMETER, 3)
    expect(fitted.rotation.y).toBeCloseTo(VEHICLE_WHEEL_YAW_OFFSET, 5)
  })

  it('fitIsaacMasonWheelModel uses bbox diameter and left mirror', () => {
    const mesh = boxMesh([0.34, 0.34, 0.34])
    const left = fitIsaacMasonWheelModel(mesh, { radius: ISAAC_WHEEL_REFERENCE_RADIUS, side: 'left' })
    const size = new THREE.Box3().setFromObject(left).getSize(new THREE.Vector3())

    expect(Math.max(size.y, size.z)).toBeCloseTo(ISAAC_WHEEL_REFERENCE_RADIUS * 2, 3)
    expect(left.rotation.y).toBeCloseTo(0, 5)
    expect(left.children[0]?.scale.x).toBe(-1)
    expect(left.children[0]?.scale.y).toBe(-1)
    expect(left.children[0]?.scale.z).toBe(-1)
  })

  it('resolveVisualSteerAngle negates driver steer for front wheels', () => {
    expect(resolveVisualSteerAngle(-0.4, 'frontLeft')).toBe(0.4)
    expect(resolveVisualSteerAngle(0.4, 'frontRight')).toBe(-0.4)
    expect(resolveVisualSteerAngle(0.3, 'backLeft')).toBe(0)
  })

  it('inferIsaacWheelSide reads wheel entity names', () => {
    expect(inferIsaacWheelSide('frontLeft')).toBe('left')
    expect(inferIsaacWheelSide('backRight')).toBe('right')
  })
})
