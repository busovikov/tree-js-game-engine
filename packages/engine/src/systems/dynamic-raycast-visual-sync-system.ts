import type { EntityId, IWorld, ISystem } from '@haku/core'
import {
  MeshRendererComponent,
  TransformComponent,
  PhysicsControllerComponent,
} from '@haku/core'
import type { ControllerWheelSlot, Transform } from '@haku/schema'
import { CONTROLLER_WHEEL_ORDER, controllerWheelLocalPositions } from '@haku/schema'
import type { Quat, Vec3 } from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'
import type { PhysicsControllerSystem } from './physics-controller-system.js'

const WHEEL_SLOT_PATTERNS: Record<ControllerWheelSlot, RegExp[]> = {
  frontLeft: [/front.?left/i, /\bfl\b/i, /wheel0/i],
  frontRight: [/front.?right/i, /\bfr\b/i, /wheel1/i],
  backLeft: [/back.?left/i, /rear.?left/i, /\bbl\b/i, /wheel2/i],
  backRight: [/back.?right/i, /rear.?right/i, /\bbr\b/i, /wheel3/i],
}

const THREEJS_WHEEL_AXLE: Vec3 = [-1, 0, 0]
const DEFAULT_WHEEL_AXLE: Vec3 = [1, 0, 0]
const SUSPENSION_SMOOTHING = 0.4

/** Three.js `CylinderGeometry` + `geometry.rotateZ(Math.PI * 0.5)` — axle along +X. */
export const DYNAMIC_RAYCAST_WHEEL_MESH_ROTATION: Quat = quatFromAxisAngle([0, 0, 1], Math.PI / 2)

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle * 0.5
  const s = Math.sin(half)
  const len = Math.hypot(axis[0], axis[1], axis[2])
  if (len === 0) {
    return [0, 0, 0, 1]
  }
  return [(axis[0] / len) * s, (axis[1] / len) * s, (axis[2] / len) * s, Math.cos(half)]
}

function multiplyQuats(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

function quatDot(a: Quat, b: Quat): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
}

/** Prevent 180° quaternion flips between consecutive frames. */
export function stabilizeQuaternion(previous: Quat | undefined, next: Quat): Quat {
  if (!previous || quatDot(previous, next) >= 0) {
    return next
  }
  return [-next[0], -next[1], -next[2], -next[3]]
}

export function unwrapWheelRotation(previous: number, raw: number): number {
  let delta = raw - previous
  while (delta > Math.PI) {
    delta -= Math.PI * 2
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2
  }
  return previous + delta
}

export function smoothSuspensionSample(previous: number, raw: number, alpha: number): number {
  if (raw <= 1e-4) {
    return previous
  }
  return previous + (raw - previous) * alpha
}

/** Matches Three.js example `updateWheels()` for Rapier DynamicRaycastVehicleController. */
export function computeDynamicRaycastWheelLocalTransform(
  localAnchor: Vec3,
  connectionY: number,
  suspensionLength: number,
  steering: number,
  rotationRad: number,
  axle: Vec3,
): { position: Vec3; rotation: Quat } {
  const steeringQuat = quatFromAxisAngle([0, 1, 0], steering)
  const rollQuat = quatFromAxisAngle(axle, rotationRad)
  const motionQuat = multiplyQuats(steeringQuat, rollQuat)
  return {
    position: [
      localAnchor[0],
      connectionY - suspensionLength,
      localAnchor[2],
    ],
    rotation: multiplyQuats(motionQuat, DYNAMIC_RAYCAST_WHEEL_MESH_ROTATION),
  }
}

/** Static rest pose for editor / scene authoring (Three.js first `updateWheels` frame). */
export function computeDynamicRaycastWheelRestTransform(
  localAnchor: Vec3,
  suspensionRestLength: number,
  axle: Vec3 = THREEJS_WHEEL_AXLE,
): { position: Vec3; rotation: Quat } {
  return computeDynamicRaycastWheelLocalTransform(
    localAnchor,
    localAnchor[1],
    suspensionRestLength,
    0,
    0,
    axle,
  )
}

export function resolveDynamicRaycastWheelSlots(
  world: IWorld,
  vehicleId: EntityId,
): Partial<Record<ControllerWheelSlot, EntityId>> {
  const resolved: Partial<Record<ControllerWheelSlot, EntityId>> = {}
  const meshChildren: EntityId[] = []

  for (const childId of world.getChildren(vehicleId)) {
    if (!world.hasComponent(childId, MeshRendererComponent)) {
      continue
    }

    meshChildren.push(childId)
    const name = world.getEntityName(childId) ?? ''
    for (const slot of CONTROLLER_WHEEL_ORDER) {
      if (resolved[slot]) {
        continue
      }
      if (WHEEL_SLOT_PATTERNS[slot].some((pattern) => pattern.test(name))) {
        resolved[slot] = childId
      }
    }
  }

  for (let i = 0; i < CONTROLLER_WHEEL_ORDER.length && i < meshChildren.length; i++) {
    const slot = CONTROLLER_WHEEL_ORDER[i]!
    if (!resolved[slot]) {
      resolved[slot] = meshChildren[i]
    }
  }

  return resolved
}

/**
 * Build a render-only resolver for suspension rest poses while physics is not stepping.
 * Authored wheel Transform components remain untouched.
 */
export function createDynamicRaycastWheelRestPoseResolver(
  world: IWorld,
): (entityId: EntityId, source: Transform) => Transform {
  const restPoses = new Map<string, Pick<Transform, 'position' | 'rotation'>>()

  for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
    const controller = world.getComponent(id, PhysicsControllerComponent)
    if (!controller?.enabled || controller.type !== 'dynamic-raycast') {
      continue
    }

    const axle =
      controller.driveProfile === 'threejs-rapier' ? THREEJS_WHEEL_AXLE : DEFAULT_WHEEL_AXLE
    const wheelAnchors = controllerWheelLocalPositions(controller.wheels)
    const slots = resolveDynamicRaycastWheelSlots(world, id)

    for (let i = 0; i < CONTROLLER_WHEEL_ORDER.length; i++) {
      const slot = CONTROLLER_WHEEL_ORDER[i]!
      const wheelEntityId = slots[slot]
      const anchor = wheelAnchors[i]
      if (!wheelEntityId || !anchor) {
        continue
      }

      const visual = computeDynamicRaycastWheelRestTransform(
        anchor,
        controller.suspension.restLength,
        axle,
      )
      const wheelTransform = world.getComponent(wheelEntityId, TransformComponent)
      if (!wheelTransform) {
        continue
      }

      restPoses.set(wheelEntityId.value, {
        position: [...visual.position],
        rotation: [...visual.rotation],
      })
    }
  }

  return (entityId, source) => {
    const restPose = restPoses.get(entityId.value)
    if (!restPose) {
      return source
    }
    return {
      position: [...restPose.position],
      rotation: [...restPose.rotation],
      scale: [...source.scale],
    }
  }
}

interface WheelVisualCache {
  suspension: number[]
  rotation: number[]
  rotationQuat: Quat[]
}

/**
 * Syncs wheel children from Rapier DynamicRaycastVehicleController.
 * Chassis transform is owned by {@link PhysicsWorldSystem} (order 50).
 */
export class DynamicRaycastVisualSyncSystem implements ISystem {
  /** Immediately after physics step + body transform sync. */
  readonly order = 51

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly controllerSystem: PhysicsControllerSystem
  private readonly wheelSlots = new Map<string, Partial<Record<ControllerWheelSlot, EntityId>>>()
  private readonly wheelVisualCache = new Map<string, WheelVisualCache>()

  constructor(
    physicsSystem: PhysicsWorldSystem,
    controllerSystem: PhysicsControllerSystem,
  ) {
    this.physicsSystem = physicsSystem
    this.controllerSystem = controllerSystem
  }

  update(world: IWorld): void {
    if (!this.physicsSystem.getPhysicsWorld()) {
      return
    }

    for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
      const controller = world.getComponent(id, PhysicsControllerComponent)
      if (!controller?.enabled || controller.type !== 'dynamic-raycast') {
        continue
      }

      const dynamicVehicle = this.controllerSystem.getDynamicRaycastVehicle(id)
      if (!dynamicVehicle || !this.physicsSystem.getBodyHandle(id)) {
        continue
      }

      const tracked = this.controllerSystem.getTrackedDynamicRaycast(id)
      const axle =
        controller.driveProfile === 'threejs-rapier' ? THREEJS_WHEEL_AXLE : DEFAULT_WHEEL_AXLE
      const wheelAnchors = controllerWheelLocalPositions(controller.wheels)
      const slots = this.resolveWheelSlots(world, id)
      const cache = this.resolveVisualCache(id.value, controller.suspension.restLength)

      for (let i = 0; i < CONTROLLER_WHEEL_ORDER.length; i++) {
        const slot = CONTROLLER_WHEEL_ORDER[i]!
        const wheelEntityId = slots[slot]
        if (!wheelEntityId) {
          continue
        }

        const anchor = wheelAnchors[i]
        if (!anchor) {
          continue
        }

        const rawSuspension = dynamicVehicle.getWheelSuspensionLength(i)
        cache.suspension[i] = smoothSuspensionSample(
          cache.suspension[i] ?? controller.suspension.restLength,
          rawSuspension,
          SUSPENSION_SMOOTHING,
        )

        const rawRotation = dynamicVehicle.getWheelRotation(i)
        cache.rotation[i] = unwrapWheelRotation(cache.rotation[i] ?? rawRotation, rawRotation)

        const steering =
          i < 2 ? (tracked?.currentSteering ?? dynamicVehicle.getWheelSteering(i)) : 0

        const visual = computeDynamicRaycastWheelLocalTransform(
          anchor,
          anchor[1],
          cache.suspension[i]!,
          steering,
          cache.rotation[i]!,
          axle,
        )

        const stabilizedRotation = stabilizeQuaternion(cache.rotationQuat[i], visual.rotation)
        cache.rotationQuat[i] = stabilizedRotation

        const wheelTransform = world.getComponent(wheelEntityId, TransformComponent)
        if (!wheelTransform) {
          continue
        }

        world.addComponent(wheelEntityId, TransformComponent, {
          position: [...visual.position],
          rotation: [...stabilizedRotation],
          scale: [...wheelTransform.scale],
        })
      }
    }
  }

  clearVehicleCache(entityId: EntityId): void {
    this.wheelVisualCache.delete(entityId.value)
    this.wheelSlots.delete(entityId.value)
  }

  dispose(): void {
    this.wheelSlots.clear()
    this.wheelVisualCache.clear()
  }

  private resolveVisualCache(vehicleKey: string, restLength: number): WheelVisualCache {
    let cache = this.wheelVisualCache.get(vehicleKey)
    if (!cache) {
      cache = {
        suspension: [restLength, restLength, restLength, restLength],
        rotation: [0, 0, 0, 0],
        rotationQuat: [
          [...DYNAMIC_RAYCAST_WHEEL_MESH_ROTATION],
          [...DYNAMIC_RAYCAST_WHEEL_MESH_ROTATION],
          [...DYNAMIC_RAYCAST_WHEEL_MESH_ROTATION],
          [...DYNAMIC_RAYCAST_WHEEL_MESH_ROTATION],
        ],
      }
      this.wheelVisualCache.set(vehicleKey, cache)
    }
    return cache
  }

  private resolveWheelSlots(
    world: IWorld,
    vehicleId: EntityId,
  ): Partial<Record<ControllerWheelSlot, EntityId>> {
    const cached = this.wheelSlots.get(vehicleId.value)
    if (cached) {
      return cached
    }
    const resolved = resolveDynamicRaycastWheelSlots(world, vehicleId)
    this.wheelSlots.set(vehicleId.value, resolved)
    return resolved
  }
}
