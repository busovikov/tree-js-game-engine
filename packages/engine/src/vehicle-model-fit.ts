import * as THREE from 'three'

/** Visual body length target (meters). */
export const VEHICLE_BODY_TARGET_LENGTH = 4.0

/** Typical raw `base.glb` Z extent before auto-fit (export units). */
export const VEHICLE_BODY_RAW_EXPORT_LENGTH_Z = 0.269

export function expectedVehicleBodyFitScale(
  rawLengthZ: number = VEHICLE_BODY_RAW_EXPORT_LENGTH_Z,
): number {
  if (rawLengthZ <= 0 || !Number.isFinite(rawLengthZ)) {
    return 1
  }
  return VEHICLE_BODY_TARGET_LENGTH / rawLengthZ
}

/** Visual tire diameter target (meters). */
export const VEHICLE_WHEEL_TARGET_DIAMETER = 0.84

/** Isaac Mason `chassis-draco.glb` — cuboid `[2.35, 0.55, 1]` half-extents, X-forward in sketch. */
export const ISAAC_CHASSIS_HALF_LENGTH = 2.35
export const ISAAC_CHASSIS_HALF_WIDTH = 1
export const ISAAC_CHASSIS_HALF_HEIGHT = 0.55
/** Reference wheel radius in Isaac custom-raycast Leva (`radius: 0.38`). */
export const ISAAC_WHEEL_REFERENCE_RADIUS = 0.38
/** Wheel GLB authored radius before Leva scale (`radius / 0.34`). */
export const ISAAC_WHEEL_GLB_REFERENCE_RADIUS = 0.34
/** Chassis mesh group offset in Isaac `vehicle.tsx` (X-forward body space). */
export const ISAAC_CHASSIS_VISUAL_OFFSET: [number, number, number] = [-0.2, -0.25, 0]

/** Body visual offset above entity origin (meters). */
export const VEHICLE_CHASSIS_LIFT = 0.5

/**
 * Centers a model on its origin and scales uniformly so `sourceSize` on the
 * chosen axis becomes `targetSize`.
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

/** Body visual yaw offset — `base.glb` nose points −Z; physics drives +Z. */
export const VEHICLE_BODY_YAW_OFFSET = Math.PI

/**
 * Wheel visual steer multiplier — negates driver steer so A/D match wheel yaw (+Z forward).
 * Also compensates `base.glb` π yaw; Isaac `wheel.glb` needs the same flip (Isaac input uses opposite sign).
 */
export const VEHICLE_WHEEL_STEER_SIGN = -1

/** Isaac sketch: `left → +steer`, `right → −steer` vs Haku `steer` axis after +Z-forward mapping. */
export const ISAAC_RAYCAST_PHYSICS_STEER_SIGN = -1

export type VehicleWheelMeshKind = 'isaac' | 'default'

export function resolveVisualSteerAngle(
  driverSteer: number,
  slot: 'frontLeft' | 'frontRight' | 'backLeft' | 'backRight',
  _meshKind: VehicleWheelMeshKind = 'default',
): number {
  if (slot !== 'frontLeft' && slot !== 'frontRight') {
    return 0
  }
  return VEHICLE_WHEEL_STEER_SIGN * driverSteer
}

/** Fit chassis GLB to reference body length (Z extent). */
export function fitVehicleBodyModel(root: THREE.Object3D): THREE.Group {
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  const fitted = fitModelToTargetSize(root, size.z, VEHICLE_BODY_TARGET_LENGTH)
  fitted.rotation.y = VEHICLE_BODY_YAW_OFFSET
  fitted.position.y = VEHICLE_CHASSIS_LIFT
  fitted.userData.hakuVehicleFit = {
    sourceLengthZ: size.z,
    targetLengthZ: VEHICLE_BODY_TARGET_LENGTH,
    fitScale: size.z > 0 ? VEHICLE_BODY_TARGET_LENGTH / size.z : 1,
  }
  return fitted
}

/** Wheel GLB yaw offset — same as body (`−Z` export → physics `+Z`). */
export const VEHICLE_WHEEL_YAW_OFFSET = Math.PI

/** Fit wheel GLB to reference tire diameter (max of Y/Z — axle is X). */
export function fitVehicleWheelModel(root: THREE.Object3D, _modelAsset?: string): THREE.Group {
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  const sourceDiameter = Math.max(size.y, size.z)
  const fitted = fitModelToTargetSize(root, sourceDiameter, VEHICLE_WHEEL_TARGET_DIAMETER)
  fitted.rotation.y = VEHICLE_WHEEL_YAW_OFFSET
  return fitted
}

const WHEEL_ASSET_PATTERN = /(?:front|back|rear)[-_]?(?:left|right)|wheel/i

export function isIsaacMasonChassisAsset(modelAsset: string): boolean {
  const base = modelAsset.split('/').pop() ?? modelAsset
  return base === 'chassis-draco.glb' || base === 'chassis.glb'
}

export function isIsaacMasonWheelAsset(modelAsset: string): boolean {
  const base = modelAsset.split('/').pop() ?? modelAsset
  return base === 'wheel-draco.glb' || base === 'wheel.glb'
}

export function isIsaacMasonModelAsset(modelAsset: string): boolean {
  return isIsaacMasonChassisAsset(modelAsset) || isIsaacMasonWheelAsset(modelAsset)
}

export function isVehicleWheelModelAsset(modelAsset: string): boolean {
  const base = modelAsset.split('/').pop() ?? modelAsset
  return WHEEL_ASSET_PATTERN.test(base) || isIsaacMasonWheelAsset(modelAsset)
}

export function isVehicleBodyModelAsset(modelAsset: string): boolean {
  const base = modelAsset.split('/').pop() ?? modelAsset
  return base === 'base.glb' || isIsaacMasonChassisAsset(modelAsset)
}

/** Meshes Isaac `vehicle.tsx` omits — placeholders only; real tires are separate `wheel.glb` children. */
const ISAAC_CHASSIS_STRIP_MESH = /^(?:Wheel(?:_\d+)?|pointer-(?:left|right)|meter)$/i

export function stripIsaacChassisPlaceholderMeshes(root: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = []
  root.traverse((obj) => {
    const name = obj.name
    if (name && ISAAC_CHASSIS_STRIP_MESH.test(name)) {
      toRemove.push(obj)
    }
  })
  for (const obj of toRemove) {
    obj.removeFromParent()
  }
}

/**
 * Isaac Mason custom-raycast chassis — cuboid `[2.35, 0.55, 1]` (X-forward in sketch).
 * Maps to Haku +Z forward collider `[width, height, length]`.
 */
export function fitIsaacMasonChassisModel(root: THREE.Object3D): THREE.Group {
  stripIsaacChassisPlaceholderMeshes(root)

  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  root.position.sub(center)

  const targetWidth = ISAAC_CHASSIS_HALF_WIDTH * 2
  const targetHeight = ISAAC_CHASSIS_HALF_HEIGHT * 2
  const targetLength = ISAAC_CHASSIS_HALF_LENGTH * 2

  const holder = new THREE.Group()
  holder.add(root)

  // GLB authored X-long (Isaac sketch inner group uses rotation-y π/2). Map X → Haku +Z.
  if (size.x >= size.y && size.x >= size.z) {
    holder.rotation.y = -Math.PI / 2
    root.scale.set(
      targetWidth / Math.max(size.z, 1e-6),
      targetHeight / Math.max(size.y, 1e-6),
      targetLength / Math.max(size.x, 1e-6),
    )
  } else if (size.z >= size.x && size.z >= size.y) {
    holder.rotation.y = 0
    root.scale.set(
      targetWidth / Math.max(size.x, 1e-6),
      targetHeight / Math.max(size.y, 1e-6),
      targetLength / Math.max(size.z, 1e-6),
    )
  } else {
    const uniform = targetLength / Math.max(size.x, size.y, size.z)
    root.scale.setScalar(uniform)
  }

  // Isaac offset [-0.2, -0.25, 0] in X-forward body → Z-forward.
  holder.position.set(0, -0.25, -0.2)
  holder.userData.hakuVehicleFit = {
    kind: 'isaac-chassis',
    targetWidth,
    targetHeight,
    targetLength,
    sourceSize: size.toArray(),
  }
  return holder
}

/** Isaac Mason wheel GLB — Leva scale `radius / 0.34`; axle is mesh +X (matches Haku `axleLocal`). */
export type IsaacWheelSide = 'left' | 'right'

export function inferIsaacWheelSide(entityName: string): IsaacWheelSide {
  return /left|\bfl\b|\bbl\b|wheel0|wheel2/i.test(entityName) ? 'left' : 'right'
}

export function fitIsaacMasonWheelModel(
  root: THREE.Object3D,
  options: { radius?: number; side?: IsaacWheelSide } = {},
): THREE.Group {
  const radius = options.radius ?? ISAAC_WHEEL_REFERENCE_RADIUS
  const side = options.side ?? 'right'

  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  root.position.sub(center)

  const sourceDiameter = Math.max(size.x, size.y, size.z)
  const targetDiameter = radius * 2
  const scale =
    sourceDiameter > 1e-6
      ? targetDiameter / sourceDiameter
      : radius / ISAAC_WHEEL_GLB_REFERENCE_RADIUS
  root.scale.setScalar(scale)

  const mirror = new THREE.Group()
  // Isaac `vehicle.tsx`: `<group scale={side === 'left' ? -1 : 1}>` — uniform flip.
  if (side === 'left') {
    mirror.scale.set(-1, -1, -1)
  }
  mirror.add(root)

  const holder = new THREE.Group()
  holder.add(mirror)
  // GLB axle is +X (vertical tire in Y-up). Haku physics roll axis is +X — no Isaac π/2 yaw.
  holder.rotation.y = 0
  holder.userData.hakuVehicleFit = { kind: 'isaac-wheel', radius, side, scale }
  return holder
}
