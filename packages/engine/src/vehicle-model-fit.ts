import * as THREE from 'three'

/** Reference CHASSIS_SIZE.z — visual body length target. */
export const VEHICLE_BODY_TARGET_LENGTH = 4.0

/** Reference WHEEL_RADIUS * 2 — visual tire diameter target. */
export const VEHICLE_WHEEL_TARGET_DIAMETER = 0.84

/** Reference CHASSIS_LIFT — body visual offset above entity origin. */
export const VEHICLE_CHASSIS_LIFT = 0.5

/**
 * Centers a model on its origin and scales uniformly so `sourceSize` on the
 * chosen axis becomes `targetSize` (reference Vehicle.js `fitModel`).
 */
export function fitModelToTargetSize(
  root: THREE.Object3D,
  sourceSize: number,
  targetSize: number,
): THREE.Group {
  if (sourceSize <= 0 || !Number.isFinite(sourceSize)) {
    const holder = new THREE.Group()
    holder.add(root)
    return holder
  }

  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.sub(center)

  const holder = new THREE.Group()
  holder.add(root)
  holder.scale.setScalar(targetSize / sourceSize)
  return holder
}

/** Fit chassis GLB to reference body length (Z extent). */
export function fitVehicleBodyModel(root: THREE.Object3D): THREE.Group {
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  const fitted = fitModelToTargetSize(root, size.z, VEHICLE_BODY_TARGET_LENGTH)
  fitted.position.y = VEHICLE_CHASSIS_LIFT
  return fitted
}

/** Fit wheel GLB to reference tire diameter (max of Y/Z — axle is X). */
export function fitVehicleWheelModel(root: THREE.Object3D): THREE.Group {
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  const sourceDiameter = Math.max(size.y, size.z)
  return fitModelToTargetSize(root, sourceDiameter, VEHICLE_WHEEL_TARGET_DIAMETER)
}

const WHEEL_ASSET_PATTERN = /(?:front|back|rear)[-_]?(?:left|right)|wheel/i

export function isVehicleWheelModelAsset(modelAsset: string): boolean {
  const base = modelAsset.split('/').pop() ?? modelAsset
  return WHEEL_ASSET_PATTERN.test(base)
}

export function isVehicleBodyModelAsset(modelAsset: string): boolean {
  const base = modelAsset.split('/').pop() ?? modelAsset
  return base === 'base.glb'
}
