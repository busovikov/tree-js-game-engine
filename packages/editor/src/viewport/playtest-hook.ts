import type { Engine } from '@haku/engine'
import { collectVehiclePlaytestMetrics } from '@haku/engine'
import type { IWorld } from '@haku/core'

export type PlaytestWindowApi = {
  getVehicleMetrics(): ReturnType<typeof collectVehiclePlaytestMetrics>
}

export interface PlaytestHookOptions {
  getWorld: () => IWorld | null
  getRaycastVehicle?: () =>
    | {
        getWheelStates(): ReadonlyArray<{ inContact: boolean }>
      }
    | undefined
}

/** Dev-only hook for Playwright vehicle alignment checks. */
export function installPlaytestHook(engine: Engine, options: PlaytestHookOptions): () => void {
  const isProd =
    typeof import.meta !== 'undefined' &&
    'env' in import.meta &&
    (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD

  if (isProd) {
    return () => {}
  }

  const api: PlaytestWindowApi = {
    getVehicleMetrics() {
      const world = options.getWorld()
      if (!world) {
        return null
      }
      return collectVehiclePlaytestMetrics(
        world,
        options.getRaycastVehicle?.() as Parameters<typeof collectVehiclePlaytestMetrics>[1],
      )
    },
  }

  ;(window as Window & { __HAKU_PLAYTEST?: PlaytestWindowApi }).__HAKU_PLAYTEST = api
  void engine

  return () => {
    delete (window as Window & { __HAKU_PLAYTEST?: PlaytestWindowApi }).__HAKU_PLAYTEST
  }
}
