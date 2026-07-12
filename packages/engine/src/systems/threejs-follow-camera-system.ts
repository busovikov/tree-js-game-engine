import type { EntityId, IWorld, ISystem } from '@haku/core'
import {
  CameraComponent,
  PhysicsControllerComponent,
  TransformComponent,
} from '@haku/core'
import type { Vec3 } from '@haku/schema'
import { lookAtQuaternion } from './chase-camera-system.js'
import type { PhysicsWorldSystem } from './physics-world-system.js'

export interface ThreeJsFollowCameraSystemOptions {
  controlledEntity?: EntityId | null
  cameraEntityId?: EntityId | null
  physicsSystem?: PhysicsWorldSystem | null
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

/**
 * Three.js OrbitControls-style follow camera: fixed world-space offset from vehicle,
 * look target at vehicle position. No throttle orbit reset or airborne blend.
 */
export class ThreeJsFollowCameraSystem implements ISystem {
  readonly order = 91

  private controlledEntity: EntityId | null
  private cameraEntityId: EntityId | null
  private worldOffset: Vec3 | null = null
  private readonly physicsSystem: PhysicsWorldSystem | null

  constructor(options: ThreeJsFollowCameraSystemOptions = {}) {
    this.controlledEntity = options.controlledEntity ?? null
    this.cameraEntityId = options.cameraEntityId ?? null
    this.physicsSystem = options.physicsSystem ?? null
  }

  setControlledEntity(id: EntityId | null): void {
    this.controlledEntity = id
    this.worldOffset = null
  }

  setCameraEntityId(id: EntityId | null): void {
    this.cameraEntityId = id
    this.worldOffset = null
  }

  update(world: IWorld): void {
    const vehicleId = this.resolveControlledEntity(world)
    const cameraId = this.resolveCameraEntity(world)
    if (!vehicleId || !cameraId) {
      return
    }

    const authoritativeVehicleTransform = world.getComponent(vehicleId, TransformComponent)
    const cameraTransform = world.getComponent(cameraId, TransformComponent)
    if (!authoritativeVehicleTransform || !cameraTransform) {
      return
    }
    const vehicleTransform =
      this.physicsSystem?.resolvePresentationTransform(
        vehicleId,
        authoritativeVehicleTransform,
      ) ?? authoritativeVehicleTransform

    if (!this.worldOffset) {
      this.worldOffset = subVec3(cameraTransform.position, vehicleTransform.position)
    }

    const position = addVec3(vehicleTransform.position, this.worldOffset)
    const lookTarget = vehicleTransform.position

    world.addComponent(cameraId, TransformComponent, {
      position: [...position] as Vec3,
      rotation: lookAtQuaternion(position, lookTarget),
      scale: [...cameraTransform.scale] as Vec3,
    })
  }

  dispose(): void {
    this.worldOffset = null
  }

  private resolveControlledEntity(world: IWorld): EntityId | null {
    if (this.controlledEntity) {
      return this.controlledEntity
    }
    for (const id of world.query(PhysicsControllerComponent, TransformComponent)) {
      const controller = world.getComponent(id, PhysicsControllerComponent)
      if (
        controller?.enabled &&
        controller.type === 'dynamic-raycast' &&
        controller.driveProfile === 'threejs-rapier'
      ) {
        return id
      }
    }
    return null
  }

  private resolveCameraEntity(world: IWorld): EntityId | null {
    if (this.cameraEntityId) {
      return this.cameraEntityId
    }
    for (const id of world.query(CameraComponent, TransformComponent)) {
      const camera = world.getComponent(id, CameraComponent)
      if (camera?.enabled) {
        return id
      }
    }
    return null
  }
}

export function usesThreeJsFollowCamera(world: IWorld, controlledEntity: EntityId | null): boolean {
  const vehicleId = controlledEntity ?? findThreeJsRapierVehicle(world)
  if (!vehicleId) {
    return false
  }
  const controller = world.getComponent(vehicleId, PhysicsControllerComponent)
  return controller?.type === 'dynamic-raycast' && controller.driveProfile === 'threejs-rapier'
}

function findThreeJsRapierVehicle(world: IWorld): EntityId | null {
  for (const id of world.query(PhysicsControllerComponent)) {
    const controller = world.getComponent(id, PhysicsControllerComponent)
    if (
      controller?.enabled &&
      controller.type === 'dynamic-raycast' &&
      controller.driveProfile === 'threejs-rapier'
    ) {
      return id
    }
  }
  return null
}
