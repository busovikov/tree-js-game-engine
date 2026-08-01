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
import { registerUINodeContracts, registerUIRuntimeAdapters, type UIService } from '@haku/ui'
import { BOUNCE_RUN_SESSION_IDS, createBounceRunSessionGraph } from './session-graph.js'

export type BounceRunSessionState = 'start' | 'active' | 'paused' | 'game-over'

export interface BounceRunSessionRuntime {
  initialize(): void
  start(): void
  pause(): void
  resume(): void
  fail(): void
  restart(): void
  state(): BounceRunSessionState
  traceCount(): number
  destroy(): void
}

export function createBounceRunSessionRuntime(options: {
  readonly scheduler: EngineScheduler
  readonly ui: UIService
}): BounceRunSessionRuntime {
  const nodeRegistry = createFoundationNodeRegistry([registerUINodeContracts])
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
  })
  const runtimes = new NodeRuntimeRegistry()
  registerFoundationRuntimeAdapters(runtimes)
  registerDeterministicRuntimeAdapters(runtimes, {
    variables,
    random: createSeededRandomService(0xb00ce),
  })
  registerUIRuntimeAdapters(runtimes, options.ui)
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

  return {
    initialize: () => run(BOUNCE_RUN_SESSION_IDS.nodes.start),
    start: () => run(BOUNCE_RUN_SESSION_IDS.entries.startSession),
    pause: () => run(BOUNCE_RUN_SESSION_IDS.entries.pauseSession),
    resume: () => run(BOUNCE_RUN_SESSION_IDS.entries.resumeSession),
    fail: () => run(BOUNCE_RUN_SESSION_IDS.entries.failSession),
    restart: () => run(BOUNCE_RUN_SESSION_IDS.entries.restartSession),
    state: () => variables.get(BOUNCE_RUN_SESSION_IDS.variables.state) as BounceRunSessionState,
    traceCount: () => instance.trace.length,
    destroy: () => instance.destroy(),
  }
}
