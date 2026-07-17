import type { EntityId, IWorld, ISystem } from '@haku/core'
import {
  MeshRendererComponent,
  TransformComponent,
  PhysicsControllerComponent,
} from '@haku/core'
import type { ControllerWheelSlot } from '@haku/schema'
import { CONTROLLER_WHEEL_ORDER, normalizeMeshRenderer } from '@haku/schema'
import type {
  IPhysicsWorld,
  PhysicsTransform,
  Quat,
  Vec3,
  WheelConfig,
  WheelState,
} from '@haku/physics'
import { computeWheelWorldPose } from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'
import type { PhysicsControllerSystem } from './physics-controller-system.js'
import { raycastWheelConfigs } from './physics-controller-system.js'
import {
  isIsaacMasonWheelAsset,
  resolveVisualSteerAngle,
} from '../vehicle-model-fit.js'

/**
 * Revolute wheel meshes are Y-axis cylinders; the wheel body spins about its local Z (the lateral
 * axle), so post-rotate the body pose to bring the cylinder axis onto Z. Matches the collider's
 * `WHEEL_AXIS_ROTATION` in physics-controller-runtime.ts (+90° about X).
 */
const REVOLUTE_WHEEL_MESH_ROTATION: Quat = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]

const WHEEL_SLOT_PATTERNS: Record<ControllerWheelSlot, RegExp[]> = {
  frontLeft: [/front.?left/i, /\bfl\b/i, /wheel0/i],
  frontRight: [/front.?right/i, /\bfr\b/i, /wheel1/i],
  backLeft: [/back.?left/i, /rear.?left/i, /\bbl\b/i, /wheel2/i],
  backRight: [/back.?right/i, /rear.?right/i, /\bbr\b/i, /wheel3/i],
}

export interface WheelVisualTransform {
  position: Vec3
  rotation: Quat
}

/** Chassis-local wheel pose — `visualSteerAngle` is driver/physics steer for display. */
export function computeWheelVisualTransform(
  chassisTransform: PhysicsTransform,
  config: WheelConfig,
  state: WheelState,
  visualSteerAngle: number = state.steering,
): WheelVisualTransform {
  const suspensionLength = state.inContact
    ? state.suspensionLength
    : config.suspensionRestLength

  const { worldPosition, worldRotation } = computeWheelWorldPose(
    chassisTransform,
    config,
    visualSteerAngle,
    -state.rotation,
    suspensionLength,
  )

  return {
    position: worldPointToLocal(chassisTransform, worldPosition),
    rotation: multiplyQuats(conjugateQuat(chassisTransform.rotation), worldRotation),
  }
}

/**
 * Syncs four wheel child meshes from raycast-vehicle wheel state.
 * {@link PhysicsWorldSystem} exclusively owns the simulation-authoritative chassis transform.
 */
export class VehicleVisualSyncSystem implements ISystem {
  readonly order = 90

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly controllerSystem: PhysicsControllerSystem
  private readonly wheelSlots = new Map<string, Partial<Record<ControllerWheelSlot, EntityId>>>()

  constructor(
    physicsSystem: PhysicsWorldSystem,
    controllerSystem: PhysicsControllerSystem,
  ) {
    this.physicsSystem = physicsSystem
    this.controllerSystem = controllerSystem
  }

  update(world: IWorld): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (!physicsWorld) {
      return
    }

    for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
      const controllerData = world.getComponent(id, PhysicsControllerComponent)
      if (!controllerData?.enabled) {
        continue
      }

      if (controllerData.type === 'revolute-joint-vehicle') {
        this.syncRevoluteVehicle(world, id, physicsWorld)
        continue
      }

      if (controllerData.type !== 'custom-raycast') {
        continue
      }

      const raycastVehicle = this.controllerSystem.getRaycastVehicle(id)
      if (!raycastVehicle) {
        continue
      }

      const bodyHandle = this.physicsSystem.getBodyHandle(id)
      if (!bodyHandle) {
        continue
      }

      const chassisTransform = physicsWorld.getBodyTransform(bodyHandle)
      const wheelStates = raycastVehicle.getWheelStates()
      if (wheelStates.length !== 4) {
        continue
      }

      const configs = raycastWheelConfigs(controllerData)
      const slots = this.resolveWheelSlots(world, id)
      const driverSteer = this.controllerSystem.getCurrentSteer(id) ?? 0

      for (let i = 0; i < 4; i++) {
        const slot = CONTROLLER_WHEEL_ORDER[i]!
        const wheelEntityId = slots[slot]
        if (!wheelEntityId) {
          continue
        }

        const config = configs[i]
        const state = wheelStates[i]
        if (!config || !state) {
          continue
        }

        const isaacWheel = this.isIsaacWheelEntity(world, wheelEntityId)
        const visualSteer =
          slot === 'frontLeft' || slot === 'frontRight'
            ? isaacWheel
              ? state.steering
              : resolveVisualSteerAngle(driverSteer, slot)
            : 0
        const visual = computeWheelVisualTransform(
          chassisTransform,
          config,
          state,
          visualSteer,
        )
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

  /**
   * Revolute-joint vehicles spawn their wheels as independent rigid bodies (no raycast state), so
   * their child wheel meshes track the wheel bodies' world transforms, expressed chassis-local.
   */
  private syncRevoluteVehicle(world: IWorld, id: EntityId, physicsWorld: IPhysicsWorld): void {
    const chassisHandle = this.physicsSystem.getBodyHandle(id)
    if (!chassisHandle) {
      return
    }
    const wheelBodies = this.controllerSystem.getRevoluteWheelBodies(id)
    if (!wheelBodies || wheelBodies.length === 0) {
      return
    }

    const chassisTransform = physicsWorld.getBodyTransform(chassisHandle)
    const slots = this.resolveWheelSlots(world, id)

    for (let i = 0; i < CONTROLLER_WHEEL_ORDER.length && i < wheelBodies.length; i++) {
      const slot = CONTROLLER_WHEEL_ORDER[i]!
      const wheelEntityId = slots[slot]
      const wheelBody = wheelBodies[i]
      if (!wheelEntityId || !wheelBody) {
        continue
      }

      const wheelWorld = physicsWorld.getBodyTransform(wheelBody)
      const wheelTransform = world.getComponent(wheelEntityId, TransformComponent)
      if (!wheelTransform) {
        continue
      }

      const bodyLocalRotation = multiplyQuats(
        conjugateQuat(chassisTransform.rotation),
        wheelWorld.rotation,
      )
      world.addComponent(wheelEntityId, TransformComponent, {
        position: worldPointToLocal(chassisTransform, wheelWorld.position),
        rotation: multiplyQuats(bodyLocalRotation, REVOLUTE_WHEEL_MESH_ROTATION),
        scale: [...wheelTransform.scale],
      })
    }
  }

  dispose(): void {
    this.wheelSlots.clear()
  }

  private isIsaacWheelEntity(world: IWorld, wheelEntityId: EntityId): boolean {
    const renderer = world.getComponent(wheelEntityId, MeshRendererComponent)
    if (!renderer) return false
    return isIsaacMasonWheelAsset(normalizeMeshRenderer(renderer).modelAsset.trim())
  }

  private resolveWheelSlots(
    world: IWorld,
    vehicleId: EntityId,
  ): Partial<Record<ControllerWheelSlot, EntityId>> {
    const cached = this.wheelSlots.get(vehicleId.value)
    if (cached) {
      return cached
    }

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

    this.wheelSlots.set(vehicleId.value, resolved)
    return resolved
  }
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

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
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
