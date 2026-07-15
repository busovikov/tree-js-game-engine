import type { Collider, ControllerChassis, PhysicsController } from '@haku/schema'
import { controllerChassisCollider, controllerNeedsChassis, ColliderSchema } from '@haku/schema'
import type { PhysicsShapeDescriptor, PhysicsTransform, Quat, RigidBodyType, Vec3 } from '@haku/physics'

function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

function rotateVec3ByQuat([x, y, z]: Vec3, [qx, qy, qz, qw]: Quat): Vec3 {
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

const SPAWNABLE_COLLIDER_SHAPES = new Set<Collider['shape']>([
  'box',
  'sphere',
  'capsule',
  'cylinder',
  'convexHull',
  'trimesh',
  'worldBoundary',
])

/**
 * Converts a collider to a spawnable shape, or returns null for a shape the backend cannot
 * represent (e.g. heightfield). Honours {@link Collider.unsupportedShapePolicy}: the default
 * 'skip' drops the collider with a loud error rather than crashing the per-frame reconcile.
 */
export function tryColliderToPhysicsShape(
  collider: Collider,
  scale: Vec3,
): PhysicsShapeDescriptor | null {
  if (!SPAWNABLE_COLLIDER_SHAPES.has(collider.shape)) {
    // No analytic AABB substitute is available for these shapes yet, so aabbFallback also skips —
    // per the design rule "skip + loud error, never a silent substitution".
    console.error(
      `[physics] collider shape '${collider.shape}' is not supported by the physics backend; skipping collider`,
    )
    return null
  }
  return colliderToPhysicsShape(collider, scale)
}

export function colliderToPhysicsShape(collider: Collider, scale: Vec3): PhysicsShapeDescriptor {
  const sx = Math.abs(scale[0])
  const sy = Math.abs(scale[1])
  const sz = Math.abs(scale[2])

  switch (collider.shape) {
    case 'box':
      return {
        type: 'box',
        halfExtents: [
          collider.halfExtents[0] * sx,
          collider.halfExtents[1] * sy,
          collider.halfExtents[2] * sz,
        ],
      }
    case 'sphere': {
      const uniformScale = Math.max(sx, sy, sz)
      return { type: 'sphere', radius: collider.radius * uniformScale }
    }
    case 'capsule':
      return {
        type: 'capsule',
        radius: collider.radius * Math.max(sx, sz),
        halfHeight: collider.halfHeight * sy,
      }
    case 'cylinder':
      return {
        type: 'cylinder',
        radius: collider.radius * Math.max(sx, sz),
        halfHeight: collider.halfHeight * sy,
      }
    case 'convexHull':
      return { type: 'convexHull', points: collider.points }
    case 'trimesh':
      return {
        type: 'trimesh',
        vertices: collider.vertices,
        indices: collider.indices,
      }
    case 'worldBoundary':
      return { type: 'worldBoundary', normal: collider.normal as Vec3 }
    default:
      throw new Error(`Unsupported collider shape for physics spawn: ${(collider as Collider).shape}`)
  }
}

export function composeColliderLocalTransform(
  scale: Vec3,
  collider: Collider,
): PhysicsTransform {
  const scaledOffset: Vec3 = [
    collider.offset[0] * scale[0],
    collider.offset[1] * scale[1],
    collider.offset[2] * scale[2],
  ]
  return {
    position: scaledOffset,
    rotation: collider.rotation as Quat,
  }
}

export function composeColliderTransform(
  position: Vec3,
  rotation: Quat,
  scale: Vec3,
  collider: Collider,
): PhysicsTransform {
  const scaledOffset: Vec3 = [
    collider.offset[0] * scale[0],
    collider.offset[1] * scale[1],
    collider.offset[2] * scale[2],
  ]
  const rotatedOffset = rotateVec3ByQuat(scaledOffset, rotation)
  return {
    position: [
      position[0] + rotatedOffset[0],
      position[1] + rotatedOffset[1],
      position[2] + rotatedOffset[2],
    ],
    rotation: quatMul(rotation, collider.rotation as Quat),
  }
}

export function controllerChassisColliderFromComponent(
  chassis: ControllerChassis,
): Collider {
  return controllerChassisCollider(chassis)
}

/** @deprecated use controllerChassisColliderFromComponent */
export function vehicleChassisCollider(chassis: ControllerChassis): Collider {
  return controllerChassisColliderFromComponent(chassis)
}

export interface ResolvedColliderDescriptor {
  collider: Collider
  source: 'explicit' | 'implicit-controller'
  bodyTypeOverride?: RigidBodyType
}

export function resolveColliderDescriptor(
  controller: PhysicsController | null | undefined,
  explicitCollider: Collider | null | undefined,
): ResolvedColliderDescriptor | null {
  if (controller?.enabled === false) {
    return null
  }

  if (!controller) {
    return explicitCollider ? { collider: explicitCollider, source: 'explicit' } : null
  }

  if (controllerNeedsChassis(controller.type)) {
    if (controller.type === 'arcade-vehicle' && explicitCollider) {
      return {
        collider: explicitCollider,
        source: 'explicit',
        bodyTypeOverride: 'dynamic',
      }
    }
    if (
      controller.type === 'custom-raycast' ||
      controller.type === 'dynamic-raycast' ||
      controller.type === 'arcade-vehicle' ||
      controller.type === 'revolute-joint-vehicle'
    ) {
      return {
        collider: controllerChassisColliderFromComponent(controller.chassis),
        source: 'implicit-controller',
        bodyTypeOverride: 'dynamic',
      }
    }
  }

  if (controller.type === 'kinematic-character' || controller.type === 'character-body') {
    const capsuleRadius = controller.capsuleRadius
    const capsuleHalfHeight = controller.capsuleHalfHeight
    return {
      collider: ColliderSchema.parse({
        shape: 'capsule',
        radius: capsuleRadius,
        halfHeight: capsuleHalfHeight,
        offset: [0, capsuleHalfHeight + capsuleRadius, 0],
        rotation: [0, 0, 0, 1],
      }),
      source: 'implicit-controller',
      bodyTypeOverride: 'kinematic',
    }
  }

  return null
}
