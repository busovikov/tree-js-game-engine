import type { EntityId, IWorld, ISystem } from '@haku/core'
import {
  MeshRendererComponent,
  TransformComponent,
  VehicleComponent,
} from '@haku/core'
import type { VehicleWheelSlot } from '@haku/schema'
import { VEHICLE_WHEEL_ORDER } from '@haku/schema'
import type {
  IRaycastVehicle,
  PhysicsTransform,
  Quat,
  Vec3,
  WheelConfig,
  WheelState,
} from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'
import type { VehicleControllerSystem } from './vehicle-controller-system.js'
import { vehicleWheelConfigs } from './vehicle-controller-system.js'

const DOWN_LOCAL: Vec3 = [0, -1, 0]

const WHEEL_SLOT_PATTERNS: Record<VehicleWheelSlot, RegExp[]> = {
  frontLeft: [/front.?left/i, /\bfl\b/i, /wheel0/i],
  frontRight: [/front.?right/i, /\bfr\b/i, /wheel1/i],
  backLeft: [/back.?left/i, /rear.?left/i, /\bbl\b/i, /wheel2/i],
  backRight: [/back.?right/i, /rear.?right/i, /\bbr\b/i, /wheel3/i],
}

export interface WheelVisualTransform {
  position: Vec3
  rotation: Quat
}

/** Chassis-local wheel pose from physics wheel state (reference `_syncVisuals` logic). */
export function computeWheelVisualTransform(
  chassisTransform: PhysicsTransform,
  config: WheelConfig,
  state: WheelState,
): WheelVisualTransform {
  const steerQuat = steeringQuat(state.steering)
  const wheelBasis = composeWheelBasis(chassisTransform.rotation, steerQuat)
  const suspDir = rotateVec3ByQuat(DOWN_LOCAL, wheelBasis)

  const connectionWorld = transformLocalPoint(chassisTransform, config.localPosition)
  const suspLength = state.inContact
    ? state.suspensionLength
    : config.suspensionRestLength
  const wheelCenterWorld = addVec3(connectionWorld, scaleVec3(suspDir, suspLength))

  const spinQuat = axisAngleQuat([1, 0, 0], state.rotation)
  const wheelWorldQuat = multiplyQuats(wheelBasis, spinQuat)

  return {
    position: worldPointToLocal(chassisTransform, wheelCenterWorld),
    rotation: multiplyQuats(conjugateQuat(chassisTransform.rotation), wheelWorldQuat),
  }
}

/**
 * Syncs chassis transform from the physics body and four wheel child meshes from
 * {@link IRaycastVehicle} wheel state each frame.
 *
 * Wheel child entities: parented to the vehicle, with {@link MeshRendererComponent},
 * named to match `frontLeft` / `frontRight` / `backLeft` / `backRight` (or first four
 * mesh children in FL→FR→BL→BR order).
 */
export class VehicleVisualSyncSystem implements ISystem {
  readonly order = 90

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly vehicleControllerSystem: VehicleControllerSystem
  private readonly wheelSlots = new Map<string, Partial<Record<VehicleWheelSlot, EntityId>>>()

  constructor(
    physicsSystem: PhysicsWorldSystem,
    vehicleControllerSystem: VehicleControllerSystem,
  ) {
    this.physicsSystem = physicsSystem
    this.vehicleControllerSystem = vehicleControllerSystem
  }

  update(world: IWorld): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (!physicsWorld) {
      return
    }

    for (const id of world.query(VehicleComponent, TransformComponent)) {
      const vehicleData = world.getComponent(id, VehicleComponent)
      if (!vehicleData?.enabled) {
        continue
      }

      const raycastVehicle = this.vehicleControllerSystem.getRaycastVehicle(id)
      if (!raycastVehicle) {
        continue
      }

      const bodyHandle = this.physicsSystem.getBodyHandle(id)
      if (!bodyHandle) {
        continue
      }

      const chassisTransform = physicsWorld.getBodyTransform(bodyHandle)
      const chassisEntityTransform = world.getComponent(id, TransformComponent)
      if (chassisEntityTransform) {
        world.addComponent(id, TransformComponent, {
          position: [...chassisTransform.position],
          rotation: [...chassisTransform.rotation],
          scale: [...chassisEntityTransform.scale],
        })
      }

      const wheelStates = raycastVehicle.getWheelStates()
      if (wheelStates.length !== 4) {
        continue
      }

      const configs = vehicleWheelConfigs(vehicleData)
      const slots = this.resolveWheelSlots(world, id)

      for (let i = 0; i < 4; i++) {
        const slot = VEHICLE_WHEEL_ORDER[i]!
        const wheelEntityId = slots[slot]
        if (!wheelEntityId) {
          continue
        }

        const config = configs[i]
        const state = wheelStates[i]
        if (!config || !state) {
          continue
        }

        const visual = computeWheelVisualTransform(chassisTransform, config, state)
        const wheelTransform = world.getComponent(wheelEntityId, TransformComponent)
        if (!wheelTransform) {
          continue
        }

        world.addComponent(wheelEntityId, TransformComponent, {
          position: [...visual.position],
          rotation: [...visual.rotation],
          scale: [...wheelTransform.scale],
        })
      }
    }
  }

  dispose(): void {
    this.wheelSlots.clear()
  }

  private resolveWheelSlots(
    world: IWorld,
    vehicleId: EntityId,
  ): Partial<Record<VehicleWheelSlot, EntityId>> {
    const cached = this.wheelSlots.get(vehicleId.value)
    if (cached) {
      return cached
    }

    const resolved: Partial<Record<VehicleWheelSlot, EntityId>> = {}
    const meshChildren: EntityId[] = []

    for (const childId of world.getChildren(vehicleId)) {
      if (!world.hasComponent(childId, MeshRendererComponent)) {
        continue
      }

      meshChildren.push(childId)
      const name = world.getEntityName(childId) ?? ''
      for (const slot of VEHICLE_WHEEL_ORDER) {
        if (resolved[slot]) {
          continue
        }
        if (WHEEL_SLOT_PATTERNS[slot].some((pattern) => pattern.test(name))) {
          resolved[slot] = childId
        }
      }
    }

    for (let i = 0; i < VEHICLE_WHEEL_ORDER.length && i < meshChildren.length; i++) {
      const slot = VEHICLE_WHEEL_ORDER[i]!
      if (!resolved[slot]) {
        resolved[slot] = meshChildren[i]
      }
    }

    this.wheelSlots.set(vehicleId.value, resolved)
    return resolved
  }
}

function steeringQuat(angle: number): Quat {
  const half = angle * 0.5
  return [0, Math.sin(half), 0, Math.cos(half)]
}

function composeWheelBasis(chassisRotation: Quat, steerRotation: Quat): Quat {
  const [ax, ay, az, aw] = chassisRotation
  const [bx, by, bz, bw] = steerRotation

  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

function axisAngleQuat(axis: Vec3, angle: number): Quat {
  const half = angle * 0.5
  const s = Math.sin(half)
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1
  return [(axis[0] / len) * s, (axis[1] / len) * s, (axis[2] / len) * s, Math.cos(half)]
}

function conjugateQuat(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
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

function worldPointToLocal(chassis: PhysicsTransform, worldPoint: Vec3): Vec3 {
  const relative = subVec3(worldPoint, chassis.position)
  return rotateVec3ByQuat(relative, conjugateQuat(chassis.rotation))
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scaleVec3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
  const [qx, qy, qz, qw] = q
  const [vx, vy, vz] = v
  const ix = qw * vx + qy * vz - qz * vy
  const iy = qw * vy + qz * vx - qx * vz
  const iz = qw * vz + qx * vy - qy * vx
  const iw = -qx * vx - qy * vy - qz * vz
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

function transformLocalPoint(transform: PhysicsTransform, local: Vec3): Vec3 {
  return addVec3(transform.position, rotateVec3ByQuat(local, transform.rotation))
}
