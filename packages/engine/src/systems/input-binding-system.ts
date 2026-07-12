import type { EntityId, IWorld, ISystem } from '@haku/core'
import { PhysicsControllerComponent } from '@haku/core'
import type { InputActions } from '../input/input-actions.js'
import type { InputManager } from '../input/input-manager.js'
import type { PhysicsControllerSystem, ControllerInput } from './physics-controller-system.js'

export interface InputBindingSystemOptions {
  /** Entity to drive; when omitted, first enabled physics controller is used. */
  controlledEntity?: EntityId | null
  /** Fired once per R keydown while input is enabled (T01.21 implements respawn). */
  onRespawn?: (entityId: EntityId) => void
}

/** Map {@link InputActions} to {@link ControllerInput}. */
export function inputActionsToControllerInput(actions: InputActions): ControllerInput {
  return {
    throttle: actions.throttle,
    steer: actions.steer,
    brake: actions.brake,
    boost: actions.boost,
    jump: actions.jump,
    sprint: actions.boost,
  }
}

/** @deprecated use inputActionsToControllerInput */
export const inputActionsToVehicleInput = inputActionsToControllerInput

/**
 * Each frame: read {@link InputManager} actions → {@link VehicleControllerSystem.setVehicleInput}.
 * Runs before {@link VehicleControllerSystem} (order 47).
 */
export class InputBindingSystem implements ISystem {
  readonly order = 47

  private controlledEntity: EntityId | null
  private readonly onRespawn?: (entityId: EntityId) => void

  constructor(
    private readonly inputManager: InputManager,
    private readonly controllerSystem: PhysicsControllerSystem,
    options: InputBindingSystemOptions = {},
  ) {
    this.controlledEntity = options.controlledEntity ?? null
    this.onRespawn = options.onRespawn
  }

  setControlledEntity(id: EntityId | null): void {
    if (this.controlledEntity) {
      this.controllerSystem.clearControllerInput(this.controlledEntity)
    }
    this.controlledEntity = id
  }

  getControlledEntity(): EntityId | null {
    return this.controlledEntity
  }

  update(world: IWorld, _dt: number): void {
    const entity = this.resolveControlledEntity(world)
    if (!entity) {
      this.inputManager.clearFramePulses()
      return
    }

    const actions = this.inputManager.getActions()
    this.controllerSystem.setControllerInput(entity, inputActionsToControllerInput(actions))

    if (actions.respawn) {
      this.onRespawn?.(entity)
    }

    this.inputManager.clearFramePulses()
  }

  dispose(): void {
    if (this.controlledEntity) {
      this.controllerSystem.clearControllerInput(this.controlledEntity)
    }
    this.controlledEntity = null
  }

  private resolveControlledEntity(world: IWorld): EntityId | null {
    if (this.controlledEntity && world.hasEntity(this.controlledEntity)) {
      return this.controlledEntity
    }

    for (const id of world.query(PhysicsControllerComponent)) {
      const controller = world.getComponent(id, PhysicsControllerComponent)
      if (controller?.enabled !== false) {
        this.controlledEntity = id
        return id
      }
    }

    return null
  }
}
