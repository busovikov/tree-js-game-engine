import type { EntityId, IWorld } from '@haku/core'
import {
  ColliderComponent,
  CollidersComponent,
  PhysicsAreaComponent,
  AnimatableBodyComponent,
  PhysicsControllerComponent,
  RigidBodyComponent,
  TransformComponent,
} from '@haku/core'
import type { AnimatableBody, Collider, PhysicsProjectSettings, RigidBody } from '@haku/schema'
import {
  bakeLayerCollisionGroups,
  defaultPhysicsProjectSettings,
  resolveBodyTypeFromComponents,
  resolveColliderPhysicsMaterial,
} from '@haku/schema'
import type {
  PhysicsShapeDescriptor,
  PhysicsShapeSpawnOptions,
  PhysicsTransform,
  Quat,
  RigidBodyDescriptor,
  RigidBodyType,
  Vec3,
} from '@haku/physics'
import {
  composeColliderLocalTransform,
  resolveColliderDescriptor,
  tryColliderToPhysicsShape,
} from './physics-collider-utils.js'

export interface BodyShapePlan {
  entityId: EntityId
  collider: Collider
  localTransform: PhysicsTransform
  shape: PhysicsShapeDescriptor
  enabled: boolean
}

export interface BodyPlan {
  rootId: EntityId
  bodyType: RigidBodyType
  bodyDescriptor: RigidBodyDescriptor
  shapes: BodyShapePlan[]
  bodyEnabled: boolean
  signature: string
}

function quatConjugate([x, y, z, w]: Quat): Quat {
  return [-x, -y, -z, w]
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

function transformToLocal(parent: PhysicsTransform, world: PhysicsTransform): PhysicsTransform {
  const invParentRot = quatConjugate(parent.rotation)
  const delta: Vec3 = [
    world.position[0] - parent.position[0],
    world.position[1] - parent.position[1],
    world.position[2] - parent.position[2],
  ]
  return {
    position: rotateVec3ByQuat(delta, invParentRot),
    rotation: quatMul(invParentRot, world.rotation),
  }
}

function entityWorldTransform(world: IWorld, id: EntityId): PhysicsTransform | null {
  const transform = world.getComponent(id, TransformComponent)
  if (!transform) {
    return null
  }
  return {
    position: transform.position as Vec3,
    rotation: transform.rotation as Quat,
  }
}

function hasAncestorComponent(
  world: IWorld,
  id: EntityId,
  typeId: string,
): boolean {
  let current = world.getParent(id)
  while (current) {
    if (world.getComponentTypes(current).includes(typeId)) {
      return true
    }
    current = world.getParent(current)
  }
  return false
}

/**
 * True when an ancestor already forms a compound body that will absorb this entity's collider.
 * Only meaningful once RigidBody/PhysicsArea/AnimatableBody ancestors have been ruled out (there is
 * then no body boundary between this entity and the absorbing root), which is how the sole caller
 * uses it. Without this guard a collider-only child under a collider-only parent is spawned twice:
 * once as its own root and once as a compound shape of the parent.
 */
function hasAbsorbingColliderAncestor(world: IWorld, id: EntityId): boolean {
  let current = world.getParent(id)
  while (current) {
    if (world.hasComponent(current, ColliderComponent)) {
      return true
    }
    const colliders = world.getComponent(current, CollidersComponent)
    if (colliders && colliders.colliders.length > 0) {
      return true
    }
    current = world.getParent(current)
  }
  return false
}

function isControllerSpawnBlocked(world: IWorld, id: EntityId): boolean {
  const controller = world.getComponent(id, PhysicsControllerComponent)
  return controller !== undefined && controller.enabled === false
}

function resolveBodyTypeForRoot(
  world: IWorld,
  rootId: EntityId,
  bodyTypeOverride?: RigidBodyType,
): RigidBodyType {
  if (bodyTypeOverride) {
    return bodyTypeOverride
  }
  const animatable = world.getComponent(rootId, AnimatableBodyComponent)
  const rigidBody = world.getComponent(rootId, RigidBodyComponent)
  if (animatable && animatable.enabled !== false && !rigidBody) {
    return 'kinematic'
  }
  return resolveBodyTypeFromComponents(rigidBody)
}

function resolveDynamicBodyParams(
  world: IWorld,
  rootId: EntityId,
  bodyType: RigidBodyType,
  rigidBody?: RigidBody,
  animatable?: AnimatableBody,
): Pick<
  RigidBodyDescriptor,
  'mass' | 'massMode' | 'angularDamping' | 'linearDamping' | 'gravityScale' | 'kinematicMode' | 'inertiaScalePitchRoll'
> {
  if (bodyType !== 'dynamic' && bodyType !== 'kinematic') {
    return { kinematicMode: rigidBody?.kinematicMode ?? 'position' }
  }

  if (animatable && !rigidBody) {
    return { kinematicMode: 'position' }
  }

  if (rigidBody) {
    return {
      mass: rigidBody.mass,
      massMode: rigidBody.massMode,
      angularDamping: rigidBody.angularDamping,
      linearDamping: rigidBody.linearDamping,
      gravityScale: rigidBody.gravityScale,
      kinematicMode: rigidBody.kinematicMode,
    }
  }

  const controller = world.getComponent(rootId, PhysicsControllerComponent)
  if (controller && controller.type !== 'kinematic-character' && controller.type !== 'character-body') {
    if (
      controller.type === 'custom-raycast' ||
      controller.type === 'dynamic-raycast' ||
      controller.type === 'arcade-vehicle' ||
      controller.type === 'revolute-joint-vehicle'
    ) {
      if (
        controller.type === 'dynamic-raycast' &&
        controller.driveProfile === 'threejs-rapier'
      ) {
        return { mass: controller.chassis.mass, kinematicMode: 'position' }
      }
      return {
        mass: controller.chassis.mass,
        angularDamping: controller.chassis.angularDamping,
        inertiaScalePitchRoll: controller.chassis.inertiaScale,
        kinematicMode: 'position',
      }
    }
  }

  return bodyType === 'dynamic' ? { mass: 1, kinematicMode: 'position' } : { kinematicMode: 'position' }
}

function colliderSpawnOptions(
  entityId: EntityId,
  collider: Collider,
  physicsSettings: PhysicsProjectSettings,
  extras: {
    isArea?: boolean
    collisionEvents?: boolean
    contactMonitor?: boolean
    maxReportedContacts?: number
  } = {},
): PhysicsShapeSpawnOptions {
  const isArea = extras.isArea === true
  const isSensor = isArea || collider.isTrigger
  const material = resolveColliderPhysicsMaterial(physicsSettings, collider)
  return {
    entityId: entityId.value,
    layer: collider.layer,
    collisionGroups: bakeLayerCollisionGroups(
      collider.layer,
      physicsSettings.layerCollisionMatrix,
    ),
    isSensor,
    collisionEvents: isSensor || extras.collisionEvents === true,
    contactMonitor: extras.contactMonitor === true,
    maxReportedContacts: extras.maxReportedContacts ?? 0,
    isArea,
    enabled: collider.enabled !== false,
    friction: material.friction,
    restitution: material.restitution,
    density: material.density,
    frictionCombine: material.frictionCombine,
    restitutionCombine: material.restitutionCombine,
  }
}

function collectCollidersArray(
  world: IWorld,
  rootId: EntityId,
  shapes: BodyShapePlan[],
  physicsSettings: PhysicsProjectSettings,
  extras: {
    isArea?: boolean
    collisionEvents?: boolean
    contactMonitor?: boolean
    maxReportedContacts?: number
  } = {},
): void {
  const collidersComponent = world.getComponent(rootId, CollidersComponent)
  if (!collidersComponent || collidersComponent.enabled === false) {
    return
  }
  const transform = world.getComponent(rootId, TransformComponent)
  if (!transform) {
    return
  }
  for (const collider of collidersComponent.colliders) {
    const localTransform = composeColliderLocalTransform(transform.scale as Vec3, collider)
    const shape = tryColliderToPhysicsShape(collider, transform.scale as Vec3)
    if (!shape) {
      continue
    }
    shapes.push({
      entityId: rootId,
      collider,
      localTransform,
      enabled: collider.enabled !== false,
      shape: {
        ...shape,
        localTransform,
        spawn: colliderSpawnOptions(rootId, collider, physicsSettings, extras),
      },
    })
  }
}

function collectCompoundColliders(
  world: IWorld,
  rootId: EntityId,
  rootWorld: PhysicsTransform,
  shapes: BodyShapePlan[],
  physicsSettings: PhysicsProjectSettings,
  extras: {
    isArea?: boolean
    collisionEvents?: boolean
    contactMonitor?: boolean
    maxReportedContacts?: number
  } = {},
): void {
  const queue: EntityId[] = [rootId]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (id !== rootId && world.hasComponent(id, RigidBodyComponent)) {
      continue
    }
    if (id !== rootId && world.hasComponent(id, PhysicsAreaComponent)) {
      continue
    }
    if (id !== rootId && world.hasComponent(id, AnimatableBodyComponent)) {
      continue
    }

    const collider = world.getComponent(id, ColliderComponent)
    if (collider) {
      const entityWorld = entityWorldTransform(world, id)
      const transform = world.getComponent(id, TransformComponent)
      if (entityWorld && transform) {
        const colliderWorld = composeWorldTransform(entityWorld, {
          position: [
            collider.offset[0] * transform.scale[0],
            collider.offset[1] * transform.scale[1],
            collider.offset[2] * transform.scale[2],
          ],
          rotation: collider.rotation as Quat,
        })
        const localTransform = transformToLocal(rootWorld, colliderWorld)
        const shape = tryColliderToPhysicsShape(collider, transform.scale as Vec3)
        if (shape) {
          shapes.push({
            entityId: id,
            collider,
            localTransform,
            enabled: collider.enabled !== false,
            shape: {
              ...shape,
              localTransform,
              spawn: colliderSpawnOptions(id, collider, physicsSettings, extras),
            },
          })
        }
      }
    }

    for (const child of world.getChildren(id)) {
      queue.push(child)
    }
  }
}

/**
 * Presence + config revision key: authored body/shape fields only.
 * World pose is simulation state (physics → ECS) and must not force recreate.
 */
function configBodyDescriptor(descriptor: RigidBodyDescriptor): Omit<RigidBodyDescriptor, 'transform'> {
  const { transform: _pose, ...config } = descriptor
  return config
}

function buildSignature(
  rootId: EntityId,
  bodyType: RigidBodyType,
  bodyDescriptor: RigidBodyDescriptor,
  shapes: BodyShapePlan[],
  bodyEnabled: boolean,
): string {
  return JSON.stringify({
    rootId: rootId.value,
    bodyType,
    bodyEnabled,
    bodyDescriptor: configBodyDescriptor(bodyDescriptor),
    shapes: shapes.map((shape) => ({
      entityId: shape.entityId.value,
      collider: shape.collider,
      localTransform: shape.localTransform,
    })),
  })
}

/** Body-only config revision (excludes shapes) for hot-reload gating. */
export function bodyConfigSignature(plan: BodyPlan): string {
  return JSON.stringify({
    rootId: plan.rootId.value,
    bodyType: plan.bodyType,
    bodyEnabled: plan.bodyEnabled,
    bodyDescriptor: configBodyDescriptor(plan.bodyDescriptor),
  })
}

export function resolveBodyPlan(
  world: IWorld,
  rootId: EntityId,
  physicsSettings: PhysicsProjectSettings = defaultPhysicsProjectSettings(),
): BodyPlan | null {
  if (isControllerSpawnBlocked(world, rootId)) {
    return null
  }

  const rootTransform = entityWorldTransform(world, rootId)
  if (!rootTransform) {
    return null
  }

  const controller = world.getComponent(rootId, PhysicsControllerComponent)
  const physicsArea = world.getComponent(rootId, PhysicsAreaComponent)
  const animatable = world.getComponent(rootId, AnimatableBodyComponent)
  const explicitCollider = world.getComponent(rootId, ColliderComponent)
  const resolved = resolveColliderDescriptor(controller, explicitCollider)
  const rigidBody = world.getComponent(rootId, RigidBodyComponent)

  let bodyType = resolveBodyTypeForRoot(world, rootId, resolved?.bodyTypeOverride)
  let bodyEnabled =
    (rigidBody?.enabled !== false) &&
    (animatable?.enabled !== false) &&
    (controller === undefined || controller.enabled !== false)

  const shapes: BodyShapePlan[] = []

  if (physicsArea) {
    bodyType = 'static'
    bodyEnabled = physicsArea.enabled !== false
    collectCompoundColliders(world, rootId, rootTransform, shapes, physicsSettings, {
      isArea: true,
      collisionEvents: physicsArea.monitoring !== false,
    })
    if (shapes.length === 0) {
      return null
    }
  } else if (resolved?.source === 'implicit-controller' && resolved.collider) {
    const transform = world.getComponent(rootId, TransformComponent)
    if (!transform) {
      return null
    }
    const localTransform = composeColliderLocalTransform(transform.scale as Vec3, resolved.collider)
    const shape = tryColliderToPhysicsShape(resolved.collider, transform.scale as Vec3)
    if (!shape) {
      return null
    }
    shapes.push({
      entityId: rootId,
      collider: resolved.collider,
      localTransform,
      enabled: true,
      shape: {
        ...shape,
        localTransform,
        spawn: colliderSpawnOptions(rootId, resolved.collider, physicsSettings, {
          collisionEvents: resolved.collider.isTrigger,
        }),
      },
    })
  } else {
    collectCollidersArray(world, rootId, shapes, physicsSettings, {
      collisionEvents: rigidBody?.contactMonitor === true,
      contactMonitor: rigidBody?.contactMonitor === true,
      maxReportedContacts: rigidBody?.maxReportedContacts ?? 0,
    })
    collectCompoundColliders(world, rootId, rootTransform, shapes, physicsSettings, {
      collisionEvents: rigidBody?.contactMonitor === true,
      contactMonitor: rigidBody?.contactMonitor === true,
      maxReportedContacts: rigidBody?.maxReportedContacts ?? 0,
    })
    if (shapes.length === 0) {
      return null
    }
  }

  const dynamicParams = resolveDynamicBodyParams(world, rootId, bodyType, rigidBody, animatable)
  const bodyDescriptor: RigidBodyDescriptor = {
    type: bodyType,
    transform: rootTransform,
    enabled: bodyEnabled,
    ccdEnabled: rigidBody?.ccdEnabled,
    lockPosition: rigidBody?.lockPosition,
    lockRotation: rigidBody?.lockRotation,
    centerOfMass: rigidBody?.centerOfMass,
    ...dynamicParams,
  }

  const signature = buildSignature(rootId, bodyType, bodyDescriptor, shapes, bodyEnabled)

  return {
    rootId,
    bodyType,
    bodyDescriptor,
    shapes,
    bodyEnabled,
    signature,
  }
}

export function findPhysicsBodyRoots(world: IWorld): EntityId[] {
  const roots: EntityId[] = []
  for (const id of world.getAllEntities()) {
    if (world.hasComponent(id, RigidBodyComponent)) {
      roots.push(id)
      continue
    }
    if (world.hasComponent(id, PhysicsAreaComponent)) {
      roots.push(id)
      continue
    }
    if (world.hasComponent(id, AnimatableBodyComponent)) {
      roots.push(id)
      continue
    }
    if (hasAncestorComponent(world, id, 'RigidBody')) {
      continue
    }
    if (hasAncestorComponent(world, id, 'PhysicsArea')) {
      continue
    }
    if (hasAncestorComponent(world, id, 'AnimatableBody')) {
      continue
    }
    if (isControllerSpawnBlocked(world, id)) {
      continue
    }
    const controller = world.getComponent(id, PhysicsControllerComponent)
    const collider = world.getComponent(id, ColliderComponent)
    const colliders = world.getComponent(id, CollidersComponent)
    // A lone ColliderComponent under a collider-bearing ancestor is absorbed into that ancestor's
    // compound body, so it must not also become an independent root. A Colliders array or a
    // controller is never absorbed by the compound walk, so those still root here.
    const absorbed = hasAbsorbingColliderAncestor(world, id)
    if (
      (collider && !absorbed) ||
      (colliders && colliders.colliders.length > 0) ||
      (controller && resolveColliderDescriptor(controller, collider))
    ) {
      roots.push(id)
    }
  }
  return roots
}

export function collectBodyPlans(
  world: IWorld,
  physicsSettings: PhysicsProjectSettings = defaultPhysicsProjectSettings(),
): BodyPlan[] {
  const plans: BodyPlan[] = []
  for (const rootId of findPhysicsBodyRoots(world)) {
    const plan = resolveBodyPlan(world, rootId, physicsSettings)
    if (plan) {
      plans.push(plan)
    }
  }
  return plans
}
