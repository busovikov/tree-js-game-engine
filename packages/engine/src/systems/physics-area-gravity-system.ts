import type { IWorld, ISystem } from '@haku/core'
import { PhysicsAreaComponent, TransformComponent } from '@haku/core'
import type { PhysicsProjectSettings } from '@haku/schema'
import { defaultPhysicsProjectSettings } from '@haku/schema'
import type { PhysicsShapeDescriptor, PhysicsTransform, Quat, Vec3 } from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'
import { resolveBodyPlan } from './physics-body-plan.js'

interface AreaGravityZone {
  gravity: Vec3
  physicsWorld: NonNullable<ReturnType<PhysicsWorldSystem['getPhysicsWorldForEntity']>>
  shapes: Array<{ descriptor: PhysicsShapeDescriptor; worldTransform: PhysicsTransform }>
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

function composeWorldTransform(
  parent: PhysicsTransform,
  local: PhysicsTransform,
): PhysicsTransform {
  const rotatedOffset = rotateVec3ByQuat(local.position, parent.rotation)
  return {
    position: [
      parent.position[0] + rotatedOffset[0],
      parent.position[1] + rotatedOffset[1],
      parent.position[2] + rotatedOffset[2],
    ],
    rotation: quatMul(parent.rotation, local.rotation),
  }
}

export interface PhysicsAreaGravitySystemOptions {
  physicsSettings?: PhysicsProjectSettings
}

/**
 * Applies {@link PhysicsAreaComponent} gravity overrides to overlapping dynamic bodies.
 */
export class PhysicsAreaGravitySystem implements ISystem {
  readonly order = 49.8

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly physicsSettings: PhysicsProjectSettings

  constructor(
    physicsSystem: PhysicsWorldSystem,
    options: PhysicsAreaGravitySystemOptions = {},
  ) {
    this.physicsSystem = physicsSystem
    this.physicsSettings = options.physicsSettings ?? defaultPhysicsProjectSettings()
  }

  update(world: IWorld): void {
    const zones = this.collectGravityZones(world)
    if (zones.length === 0) {
      return
    }

    this.physicsSystem.queueSubstepAction('physics-area-gravity', () => {
      for (const zone of zones) {
        for (const shape of zone.shapes) {
          const hits = zone.physicsWorld.overlap({
            shape: shape.descriptor,
            transform: shape.worldTransform,
          })
          for (const hit of hits) {
            if (!hit.entityId) {
              continue
            }
            // hit.entityId is the collider's owning entity (a compound child); the body may be
            // registered under a different root entity, so read mass from the body handle directly.
            const mass = zone.physicsWorld.getBodyMass(hit.body)
            zone.physicsWorld.applyForce(hit.body, [
              zone.gravity[0] * mass,
              zone.gravity[1] * mass,
              zone.gravity[2] * mass,
            ])
          }
        }
      }
    })
  }

  private collectGravityZones(world: IWorld): AreaGravityZone[] {
    const zones: AreaGravityZone[] = []

    for (const id of world.query(PhysicsAreaComponent, TransformComponent)) {
      const area = world.getComponent(id, PhysicsAreaComponent)
      if (!area || area.enabled === false) {
        continue
      }
      const gravity = area.spaceOverride?.gravity
      if (!gravity) {
        continue
      }

      const plan = resolveBodyPlan(world, id, this.physicsSettings)
      const physicsWorld = this.physicsSystem.getPhysicsWorldForEntity(id)
      if (!plan || !physicsWorld) {
        continue
      }

      zones.push({
        gravity,
        physicsWorld,
        shapes: plan.shapes.map((shapePlan) => ({
          descriptor: shapePlan.shape,
          worldTransform: composeWorldTransform(plan.bodyDescriptor.transform, shapePlan.localTransform),
        })),
      })
    }

    return zones
  }
}
