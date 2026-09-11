import type { EngineScheduler } from '@haku/core'
import { compileGraph, createBuiltinTypeRegistry, createFoundationNodeRegistry } from '@haku/graph'
import {
  GraphInstance,
  InterpreterExecutionBackend,
  NodeRuntimeRegistry,
  createGraphVariableStore,
  createSeededRandomService,
  registerDeterministicRuntimeAdapters,
  registerFoundationRuntimeAdapters,
} from '@haku/graph-runtime'
import { SaveStorageConflictError, type ISaveStorage, type SaveSlotRecord } from '@haku/storage'
import { registerUINodeContracts, registerUIRuntimeAdapters, type UIService } from '@haku/ui'
import {
  registerAudioNodeContracts,
  registerAudioRuntimeAdapters,
  type AudioService,
} from '@haku/audio'
import type { AudioBus } from '@haku/audio'
import { BOUNCE_RUN_SESSION_IDS, createBounceRunSessionGraph } from './session-graph.js'
import type { BounceRunUIGameplayAdapter } from './ui-gameplay-adapter.js'

export type BounceRunSessionState = 'start' | 'active' | 'paused' | 'game-over'

export interface BounceRunSessionRuntime {
  initialize(): Promise<void>
  start(): void
  pause(): void
  resume(): void
  fail(): Promise<void>
  restart(): void
  collectBonus(): boolean
  awardRouteProgress(platformIndex: number): boolean
  setAudioBusVolume(bus: AudioBus, volume: number): void
  setAudioBusMuted(bus: AudioBus, muted: boolean): void
  state(): BounceRunSessionState
  score(): number
  highScore(): number
  traceCount(): number
  destroy(): void
}

export const BOUNCE_RUN_HIGH_SCORE_SLOT_ID = 'bounce-run.high-score.v1'

export interface BounceRunHighScoreData {
  readonly schemaVersion: 1
  readonly highScore: number
}

export function createBounceRunSessionRuntime(options: {
  readonly scheduler: EngineScheduler
  readonly ui: UIService
  readonly storage: ISaveStorage
  readonly audio: AudioService
  readonly gameplayUI?: Pick<BounceRunUIGameplayAdapter, 'updateHud'>
  readonly routeProgressGoal?: number
}): BounceRunSessionRuntime {
  const routeProgressGoal = options.routeProgressGoal ?? 1
  if (!Number.isSafeInteger(routeProgressGoal) || routeProgressGoal <= 0) {
    throw new Error('Bounce Run route progress goal must be a positive safe integer')
  }
  const nodeRegistry = createFoundationNodeRegistry([
    registerUINodeContracts,
    registerAudioNodeContracts,
  ])
  const compiled = compileGraph(createBounceRunSessionGraph(nodeRegistry), {
    types: createBuiltinTypeRegistry(),
    nodes: nodeRegistry,
  })
  const errors = compiled.diagnostics.filter((item) => item.severity === 'error')
  if (!compiled.plan || errors.length > 0) {
    throw new Error(
      `Bounce Run session graph failed to compile: ${errors
        .map((item) => item.message)
        .join('; ')}`,
    )
  }

  const variables = createGraphVariableStore({
    [BOUNCE_RUN_SESSION_IDS.variables.state]: 'start',
    [BOUNCE_RUN_SESSION_IDS.variables.true]: true,
    [BOUNCE_RUN_SESSION_IDS.variables.false]: false,
    [BOUNCE_RUN_SESSION_IDS.variables.start]: 'start',
    [BOUNCE_RUN_SESSION_IDS.variables.active]: 'active',
    [BOUNCE_RUN_SESSION_IDS.variables.paused]: 'paused',
    [BOUNCE_RUN_SESSION_IDS.variables.gameOver]: 'game-over',
    [BOUNCE_RUN_SESSION_IDS.variables.score]: 0,
    [BOUNCE_RUN_SESSION_IDS.variables.highScore]: 0,
    [BOUNCE_RUN_SESSION_IDS.variables.routePlatformIndex]: 0,
    [BOUNCE_RUN_SESSION_IDS.variables.furthestScoredPlatform]: 0,
    [BOUNCE_RUN_SESSION_IDS.variables.scoreZero]: 0,
    [BOUNCE_RUN_SESSION_IDS.variables.bonusValue]: 1,
    [BOUNCE_RUN_SESSION_IDS.variables.routeProgressValue]: 1,
    [BOUNCE_RUN_SESSION_IDS.variables.audioBusVolume.master]: 0.8,
    [BOUNCE_RUN_SESSION_IDS.variables.audioBusVolume.music]: 0.55,
    [BOUNCE_RUN_SESSION_IDS.variables.audioBusVolume.sfx]: 0.65,
    [BOUNCE_RUN_SESSION_IDS.variables.audioBusVolume.ui]: 0.75,
    [BOUNCE_RUN_SESSION_IDS.variables.audioBusMuted.master]: false,
    [BOUNCE_RUN_SESSION_IDS.variables.audioBusMuted.music]: false,
    [BOUNCE_RUN_SESSION_IDS.variables.audioBusMuted.sfx]: false,
    [BOUNCE_RUN_SESSION_IDS.variables.audioBusMuted.ui]: false,
  })
  const runtimes = new NodeRuntimeRegistry()
  registerFoundationRuntimeAdapters(runtimes)
  registerDeterministicRuntimeAdapters(runtimes, {
    variables,
    random: createSeededRandomService(0xb00ce),
  })
  registerUIRuntimeAdapters(runtimes, options.ui)
  registerAudioRuntimeAdapters(runtimes, options.audio)
  const instance = new GraphInstance({
    id: 'b1100000-0000-4000-8000-000000000900',
    plan: compiled.plan,
    registryFingerprint: compiled.plan.registryFingerprint,
    scheduler: options.scheduler,
    backend: new InterpreterExecutionBackend(runtimes),
  })

  const run = (entry: string): void => {
    const execution = instance.start(entry)
    if (execution instanceof Promise) {
      throw new Error('Bounce Run session transitions must remain synchronous')
    }
  }

  let initialized = false
  let destroyed = false
  let initializePromise: Promise<void> | undefined
  let highScore = 0
  let highScoreRevision = 0
  let routeProgress = 0
  let writeBarrier = Promise.resolve()

  const requireInitialized = (): void => {
    if (!initialized) throw new Error('Bounce Run session runtime is not initialized')
    if (destroyed) throw new Error('Bounce Run session runtime is destroyed')
  }
  const syncHud = (): void => {
    options.gameplayUI?.updateHud({
      status: variables.get(
        BOUNCE_RUN_SESSION_IDS.variables.state,
      ) as BounceRunSessionState,
      score: variables.get(BOUNCE_RUN_SESSION_IDS.variables.score) as number,
      bestScore: highScore,
      progress: routeProgress,
    })
  }
  const renderHighScore = (): void => {
    variables.set(BOUNCE_RUN_SESSION_IDS.variables.highScore, highScore)
    if (!destroyed) {
      run(BOUNCE_RUN_SESSION_IDS.entries.renderHighScore)
      syncHud()
    }
  }
  const renderScore = (): void => {
    run(BOUNCE_RUN_SESSION_IDS.entries.renderScore)
    syncHud()
  }
  const persistHighScore = async (candidate: number): Promise<void> => {
    if (candidate <= highScore) return
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const written = await options.storage.writeSlot<BounceRunHighScoreData>({
          slotId: BOUNCE_RUN_HIGH_SCORE_SLOT_ID,
          label: 'Bounce Run high score',
          data: { schemaVersion: 1, highScore: candidate },
          expectedRevision: highScoreRevision,
        })
        highScoreRevision = written.metadata.revision
        highScore = candidate
        renderHighScore()
        return
      } catch (error) {
        if (!(error instanceof SaveStorageConflictError) || attempt === 1) throw error
        const current = await options.storage.readSlot<unknown>(BOUNCE_RUN_HIGH_SCORE_SLOT_ID)
        highScoreRevision = current?.metadata.revision ?? 0
        highScore = Math.max(highScore, parseHighScore(current))
        if (candidate <= highScore) {
          renderHighScore()
          return
        }
      }
    }
  }
  const initialize = (): Promise<void> => {
    initializePromise ??= (async () => {
      const record = await options.storage.readSlot<unknown>(BOUNCE_RUN_HIGH_SCORE_SLOT_ID)
      if (destroyed) return
      highScoreRevision = record?.metadata.revision ?? 0
      highScore = parseHighScore(record)
      variables.set(BOUNCE_RUN_SESSION_IDS.variables.highScore, highScore)
      run(BOUNCE_RUN_SESSION_IDS.nodes.start)
      initialized = true
      for (const bus of ['master', 'music', 'sfx', 'ui'] as const) {
        run(BOUNCE_RUN_SESSION_IDS.entries.audioBusVolume[bus])
        run(BOUNCE_RUN_SESSION_IDS.entries.audioBusMuted[bus])
      }
      syncHud()
    })()
    return initializePromise
  }

  return {
    initialize,
    start: () => {
      requireInitialized()
      run(BOUNCE_RUN_SESSION_IDS.entries.startSession)
      renderScore()
    },
    pause: () => {
      requireInitialized()
      run(BOUNCE_RUN_SESSION_IDS.entries.pauseSession)
      syncHud()
    },
    resume: () => {
      requireInitialized()
      run(BOUNCE_RUN_SESSION_IDS.entries.resumeSession)
      syncHud()
    },
    fail: () => {
      requireInitialized()
      run(BOUNCE_RUN_SESSION_IDS.entries.failSession)
      syncHud()
      const candidate = variables.get(BOUNCE_RUN_SESSION_IDS.variables.score) as number
      const operation = writeBarrier.then(() => persistHighScore(candidate))
      writeBarrier = operation.then(
        () => undefined,
        () => undefined,
      )
      return operation
    },
    restart: () => {
      requireInitialized()
      run(BOUNCE_RUN_SESSION_IDS.entries.restartSession)
      routeProgress = 0
      renderScore()
    },
    collectBonus: () => {
      if (variables.get(BOUNCE_RUN_SESSION_IDS.variables.state) !== 'active') return false
      run(BOUNCE_RUN_SESSION_IDS.entries.collectBonus)
      renderScore()
      return true
    },
    awardRouteProgress: (platformIndex) => {
      requireInitialized()
      if (!Number.isSafeInteger(platformIndex) || platformIndex <= 0) return false
      if (variables.get(BOUNCE_RUN_SESSION_IDS.variables.state) !== 'active') return false
      const previous = variables.get(BOUNCE_RUN_SESSION_IDS.variables.score) as number
      variables.set(BOUNCE_RUN_SESSION_IDS.variables.routePlatformIndex, platformIndex)
      instance.invalidateResource('graph.variable')
      run(BOUNCE_RUN_SESSION_IDS.entries.awardRouteProgress)
      const awarded = variables.get(BOUNCE_RUN_SESSION_IDS.variables.score) !== previous
      if (awarded) {
        routeProgress = Math.min(1, platformIndex / routeProgressGoal)
        renderScore()
      }
      return awarded
    },
    setAudioBusVolume: (bus, volume) => {
      requireInitialized()
      if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
        throw new Error('Audio volume must be a finite number from 0 to 1')
      }
      variables.set(BOUNCE_RUN_SESSION_IDS.variables.audioBusVolume[bus], volume)
      instance.invalidateResource('graph.variable')
      run(BOUNCE_RUN_SESSION_IDS.entries.audioBusVolume[bus])
    },
    setAudioBusMuted: (bus, muted) => {
      requireInitialized()
      variables.set(BOUNCE_RUN_SESSION_IDS.variables.audioBusMuted[bus], muted)
      instance.invalidateResource('graph.variable')
      run(BOUNCE_RUN_SESSION_IDS.entries.audioBusMuted[bus])
    },
    state: () => variables.get(BOUNCE_RUN_SESSION_IDS.variables.state) as BounceRunSessionState,
    score: () => variables.get(BOUNCE_RUN_SESSION_IDS.variables.score) as number,
    highScore: () => highScore,
    traceCount: () => instance.trace.length,
    destroy: () => {
      destroyed = true
      instance.destroy()
    },
  }
}

function parseHighScore(record: SaveSlotRecord<unknown> | undefined): number {
  const value = record?.data
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('highScore' in value) ||
    typeof value.highScore !== 'number' ||
    !Number.isSafeInteger(value.highScore) ||
    value.highScore < 0
  ) {
    return 0
  }
  return value.highScore
}
