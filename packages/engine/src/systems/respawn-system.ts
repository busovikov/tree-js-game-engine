import type { EntityId, IWorld, ISystem } from '@haku/core'
import { TransformComponent, VehicleComponent } from '@haku/core'
import type { Quat, Vec3 } from '@haku/schema'
import type { PhysicsTransform } from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'
import type { VehicleControllerSystem } from './vehicle-controller-system.js'

/** Reference default: auto-respawn when chassis Y drops below this (Vehicle.js). */
export const DEFAULT_RESPAWN_FALL_Y = -20

export interface SpawnPose {
  position: Vec3
  rotation: Quat
}

export interface RespawnSystemOptions {
  /** Y threshold for automatic respawn. Default: {@link DEFAULT_RESPAWN_FALL_Y}. */
  fallThresholdY?: number
  /** Controlled vehicle; otherwise first enabled {@link VehicleComponent}. */
  controlledEntity?: EntityId | null
}

/**
 * Resets the vehicle to its spawn pose on fall-below-Y or manual respawn (R key via
 * {@link InputBindingSystem} `onRespawn`). Runs after input binding (order 49).
 */
export class RespawnSystem implements ISystem {
  readonly order = 49

  private readonly fallThresholdY: number
  private controlledEntity: EntityId | null
  private readonly spawnPoses = new Map<string, SpawnPose>()
  private pendingRespawn: EntityId | null = null

  constructor(
    private readonly physicsSystem: PhysicsWorldSystem,
    private readonly vehicleController: VehicleControllerSystem,
    options: RespawnSystemOptions = {},
  ) {
    this.fallThresholdY = options.fallThresholdY ?? DEFAULT_RESPAWN_FALL_Y
    this.controlledEntity = options.controlledEntity ?? null
  }

  setControlledEntity(id: EntityId | null): void {
    this.controlledEntity = id
  }

  /** Queue respawn for the next update (used by R key pulse). */
  requestRespawn(id: EntityId): void {
    this.pendingRespawn = id
  }

  /** Immediately reset entity to spawn pose (physics + vehicle state). */
  respawnEntity(world: IWorld, id: EntityId): void {
    const spawn = this.ensureSpawnPose(world, id)
    if (!spawn) {
      return
    }

    const transform: PhysicsTransform = {
      position: [...spawn.position] as Vec3,
      rotation: [...spawn.rotation] as Quat,
    }

    this.physicsSystem.resetBodyState(id, transform, world)
    this.vehicleController.resetVehicleState(id)
  }

  update(world: IWorld, _dt: number): void {
    this.captureSpawnPoses(world)

    if (this.pendingRespawn) {
      this.respawnEntity(world, this.pendingRespawn)
      this.pendingRespawn = null
    }

    const entity = this.resolveControlledEntity(world)
    if (!entity) {
      return
    }

    const bodyTransform = this.physicsSystem.getBodyTransform(entity)
    if (!bodyTransform) {
      return
    }

    if (bodyTransform.position[1] < this.fallThresholdY) {
      this.respawnEntity(world, entity)
    }
  }

  dispose(): void {
    this.spawnPoses.clear()
    this.pendingRespawn = null
    this.controlledEntity = null
  }

  /** Spawn pose for tests and debug. */
  getSpawnPose(id: EntityId): SpawnPose | undefined {
    return this.spawnPoses.get(id.value)
  }

  private captureSpawnPoses(world: IWorld): void {
    for (const id of world.query(VehicleComponent, TransformComponent)) {
      if (this.spawnPoses.has(id.value)) {
        continue
      }
      const vehicle = world.getComponent(id, VehicleComponent)
      if (vehicle?.enabled === false) {
        continue
      }
      const transform = world.getComponent(id, TransformComponent)
      if (!transform) {
        continue
      }
      this.spawnPoses.set(id.value, {
        position: [...transform.position] as Vec3,
        rotation: [...transform.rotation] as Quat,
      })
    }
  }

  private ensureSpawnPose(world: IWorld, id: EntityId): SpawnPose | undefined {
    let spawn = this.spawnPoses.get(id.value)
    if (spawn) {
      return spawn
    }

    const transform = world.getComponent(id, TransformComponent)
    if (!transform) {
      return undefined
    }

    spawn = {
      position: [...transform.position] as Vec3,
      rotation: [...transform.rotation] as Quat,
    }
    this.spawnPoses.set(id.value, spawn)
    return spawn
  }

  private resolveControlledEntity(world: IWorld): EntityId | null {
    if (this.controlledEntity && world.hasEntity(this.controlledEntity)) {
      return this.controlledEntity
    }

    for (const id of world.query(VehicleComponent)) {
      const vehicle = world.getComponent(id, VehicleComponent)
      if (vehicle?.enabled !== false) {
        this.controlledEntity = id
        return id
      }
    }

    return null
  }
}
