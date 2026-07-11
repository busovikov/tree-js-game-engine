import type { EntityId, IWorld, ISystem } from '@haku/core'
import {
  ColliderComponent,
  StaticComponent,
  TransformComponent,
  VehicleComponent,
  entityId,
} from '@haku/core'
import type { Collider } from '@haku/schema'
import {
  createBodyWithShape,
  destroyBodyWithShape,
  type BodyWithShape,
  type PhysicsShapeDescriptor,
  type PhysicsTransform,
  type Quat,
  type RigidBodyDescriptor,
  type RigidBodyType,
  type Vec3,
} from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'

interface TrackedColliderBody {
  bodyWithShape: BodyWithShape
  type: RigidBodyType
}

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

/** World-space physics transform with collider offset baked into body origin. */
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

function resolveBodyType(world: IWorld, id: EntityId, collider: Collider): RigidBodyType {
  if (collider.isStatic || world.hasComponent(id, StaticComponent)) {
    return 'static'
  }
  return 'dynamic'
}

function resolveDynamicBodyParams(
  world: IWorld,
  id: EntityId,
  bodyType: RigidBodyType,
): Pick<RigidBodyDescriptor, 'mass' | 'angularDamping'> {
  if (bodyType !== 'dynamic') {
    return {}
  }
  const vehicle = world.getComponent(id, VehicleComponent)
  if (vehicle) {
    return {
      mass: vehicle.chassis.mass,
      angularDamping: vehicle.chassis.angularDamping,
    }
  }
  return { mass: 1 }
}

/**
 * Spawns Rapier bodies from {@link ColliderComponent} + {@link TransformComponent}
 * when play mode starts. Dynamic bodies are registered with {@link PhysicsWorldSystem}.
 */
export class PhysicsColliderSystem implements ISystem {
  readonly order = 45

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly trackedBodies = new Map<string, TrackedColliderBody>()
  private bootstrapped = false

  constructor(physicsSystem: PhysicsWorldSystem) {
    this.physicsSystem = physicsSystem
  }

  update(world: IWorld, _dt: number): void {
    if (this.bootstrapped) {
      return
    }
    this.bootstrap(world)
    this.bootstrapped = true
  }

  bootstrap(world: IWorld): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (!physicsWorld) {
      return
    }

    for (const id of world.query(TransformComponent, ColliderComponent)) {
      const transform = world.getComponent(id, TransformComponent)
      const collider = world.getComponent(id, ColliderComponent)
      if (!transform || !collider) {
        continue
      }

      const bodyType = resolveBodyType(world, id, collider)
      const dynamicParams = resolveDynamicBodyParams(world, id, bodyType)
      const entityTransform: PhysicsTransform = {
        position: transform.position as Vec3,
        rotation: transform.rotation as Quat,
      }
      const shape = {
        ...colliderToPhysicsShape(collider, transform.scale as Vec3),
        localTransform: composeColliderLocalTransform(transform.scale as Vec3, collider),
      }

      const bodyWithShape = createBodyWithShape(
        physicsWorld,
        {
          type: bodyType,
          transform: entityTransform,
          ...dynamicParams,
        },
        shape,
      )

      this.trackedBodies.set(id.value, { bodyWithShape, type: bodyType })

      if (bodyType !== 'static') {
        this.physicsSystem.registerBody(id, bodyWithShape.body, bodyType, world)
      }
    }

    this.physicsSystem.prepareSceneQueries()
  }

  dispose(): void {
    const physicsWorld = this.physicsSystem.getPhysicsWorld()
    if (physicsWorld) {
      for (const { bodyWithShape } of this.trackedBodies.values()) {
        destroyBodyWithShape(physicsWorld, bodyWithShape.body, bodyWithShape.shape)
      }
    }

    for (const [entityIdValue, { bodyWithShape, type }] of this.trackedBodies) {
      if (type !== 'static') {
        this.physicsSystem.unregisterBody(entityId(entityIdValue))
      }
      void bodyWithShape
    }

    this.trackedBodies.clear()
    this.bootstrapped = false
  }
}
