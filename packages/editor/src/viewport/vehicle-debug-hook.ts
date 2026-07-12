import type { Engine } from '@haku/engine'
import {
  createVehicleDebugWindowApi,
  createHttpVehicleDebugLogSink,
  type VehicleDebugCollectContext,
  type VehicleDebugWindowApi,
} from '@haku/engine'
import type { IWorld } from '@haku/core'
import { PhysicsControllerComponent } from '@haku/core'
import type { VehiclePlayModeSession } from '@haku/engine'

export interface VehicleDebugHookOptions {
  getWorld: () => IWorld | null
  getEngine: () => Engine | null
  getVehicleSession: () => VehiclePlayModeSession | undefined
}

/** Dev-only vehicle physics logger for interactive debugging. */
export function installVehicleDebugHook(options: VehicleDebugHookOptions): () => void {
  const isProd =
    typeof import.meta !== 'undefined' &&
    'env' in import.meta &&
    (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD

  if (isProd) {
    return () => {}
  }

  const getContext = (): VehicleDebugCollectContext | null => {
    const world = options.getWorld()
    const engine = options.getEngine()
    const session = options.getVehicleSession()
    const physicsSystem = engine?.getPhysicsWorldSystem() ?? null
    if (!world || !physicsSystem || !session) {
      return null
    }

    let raycastVehicle
    for (const id of world.query(PhysicsControllerComponent)) {
      const vehicle = session.controllerSystem.getRaycastVehicle(id)
      if (vehicle) {
        raycastVehicle = vehicle
        break
      }
    }

    return {
      physicsSystem,
      vehicleController: session.controllerSystem,
      raycastVehicle,
    }
  }

  const api: VehicleDebugWindowApi = createVehicleDebugWindowApi(
    options.getWorld,
    getContext,
    { sink: createHttpVehicleDebugLogSink() },
  )

  ;(window as Window & { __HAKU_VEHICLE_DEBUG?: VehicleDebugWindowApi }).__HAKU_VEHICLE_DEBUG =
    api

  return () => {
    api.stopLog()
    delete (window as Window & { __HAKU_VEHICLE_DEBUG?: VehicleDebugWindowApi }).__HAKU_VEHICLE_DEBUG
  }
}
