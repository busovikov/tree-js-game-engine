import {
  AUDIO_GRAPH_CONTRACTS,
  AudioRuntime,
  AudioService,
  HeadlessAudioBackend,
  registerAudioNodeContracts,
  registerAudioRuntimeAdapters,
} from '@haku/audio'
import { EngineScheduler, World } from '@haku/core'
import {
  DETERMINISTIC_GRAPH_CONTRACTS,
  FOUNDATION_GRAPH_IDS,
  SERVICE_GRAPH_CONTRACTS,
  analyzeNodeCheckpointEligibility,
  createFoundationNodeRegistry,
  type ExecutionPlanNode,
  type GraphExecutionPlan,
  type NodeRegistry,
} from '@haku/graph'
import {
  GraphInstance,
  InterpreterExecutionBackend,
  createFoundationRuntimeRegistry,
  createGraphVariableStore,
  createSeededRandomService,
  type CheckpointableAsyncTask,
  type CheckpointEffectRecord,
  type NodeExecutionRequest,
  type NodeExecutionResult,
} from '@haku/graph-runtime'
import {
  EntityPool,
  POOL_GRAPH_CONTRACTS,
  PoolRegistry,
  registerPoolNodeContracts,
  registerPoolRuntimeAdapters,
} from '@haku/pool'
import {
  BrowserPlatformAdapter,
  createPlatformGraphService,
} from '@haku/platform'
import {
  InMemorySaveStorage,
  createStorageGraphService,
} from '@haku/storage'
import {
  UI_GRAPH_CONTRACTS,
  registerUINodeContracts,
  registerUIRuntimeAdapters,
} from '@haku/ui'
import {
  createAudioDiagnostic,
  type AudioDiagnostic,
} from './audio-diagnostic.js'
import { runCrossServiceStaticExportFixture } from './cross-service-static-export.js'
import { createUIDiagnostic } from './ui-diagnostic.js'

const uid = (value: number): string =>
  `74600000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const POOL_ID = uid(1)
const GRAPH_ID = uid(2)
const INSTANCE_ID = uid(3)
const NODE_IDS = {
  start: uid(10),
  pool: uid(11),
  ui: uid(12),
  audio: uid(13),
  save: uid(14),
  random: uid(15),
  platform: uid(16),
} as const

export interface CrossServiceDiagnosticOptions {
  readonly createAudioDiagnostic?: (
    host: HTMLElement,
  ) => AudioDiagnostic
  readonly runStaticExport?: typeof runCrossServiceStaticExportFixture
}

export interface CrossServiceDiagnostic {
  runGraph(): Promise<void>
  runExport(): Promise<void>
  destroy(): void
}

export function createCrossServiceDiagnostic(
  host: HTMLElement,
  options: CrossServiceDiagnosticOptions = {},
): CrossServiceDiagnostic {
  host.innerHTML = `
    <div data-cross-service-card>
      <strong>M10f Cross-service Foundation</strong>
      <div data-cross-service-status role="status">Ready for combined graph run</div>
      <div data-cross-service-actions>
        <button type="button" data-cross-service-action="run">Run graph services</button>
        <button type="button" data-cross-service-action="export">Run static export</button>
      </div>
      <div data-cross-service-ui></div>
      <div data-cross-service-audio></div>
      <pre data-cross-service-details>Effects: pending
Trace: pending
Export: pending</pre>
    </div>
  `
  Object.assign(host.style, {
    color: '#f5f7ff',
    background: '#171a2b',
    border: '1px solid #f0b45a',
    borderRadius: '10px',
    padding: '14px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
  })
  host.setAttribute('role', 'region')
  host.setAttribute('aria-label', 'M10f cross-service graph diagnostic')

  const status = host.querySelector<HTMLElement>('[data-cross-service-status]')!
  const details = host.querySelector<HTMLElement>('[data-cross-service-details]')!
  const uiHost = host.querySelector<HTMLElement>('[data-cross-service-ui]')!
  const audioHost = host.querySelector<HTMLElement>('[data-cross-service-audio]')!
  Object.assign(uiHost.style, { height: '190px', marginTop: '10px' })
  Object.assign(audioHost.style, { marginTop: '10px' })

  const ui = createUIDiagnostic(uiHost)
  const audioDiagnostic = (options.createAudioDiagnostic ?? createAudioDiagnostic)(
    audioHost,
  )
  const world = new World()
  const pool = new EntityPool({
    id: POOL_ID,
    world,
    capacity: 1,
    maximum: 1,
    expansionPolicy: 'fixed',
    exhaustionPolicy: 'return-null',
    createInstance: () => world.createEntity('M10f pooled diagnostic'),
  })
  pool.prewarm(1)
  const pools = new PoolRegistry()
  pools.register(pool)

  const storage = new InMemorySaveStorage({
    now: () => '2026-07-30T00:00:00.000Z',
  })
  const save = createStorageGraphService(storage, {
    slotId: 'm10f-cross-service',
    label: 'M10f Cross-service',
  })
  const platform = new BrowserPlatformAdapter({
    controls: {
      setSimulationPaused: () => {},
      setInputEnabled: () => {},
      setAudioPaused: (paused) => audioDiagnostic.setPaused(paused),
    },
  })
  platform.start()
  const platformGraph = createPlatformGraphService(platform)
  const random = createSeededRandomService(0x10f)
  const variables = createGraphVariableStore()
  const audioRuntime = new AudioRuntime(new HeadlessAudioBackend())
  const audio = new AudioService(audioRuntime)
  const catalog = createFoundationNodeRegistry([
    registerPoolNodeContracts,
    registerUINodeContracts,
    registerAudioNodeContracts,
  ])
  const runtimes = createFoundationRuntimeRegistry(
    {
      deterministic: { random, variables },
      world: {
        getTransformPosition: () => [0, 0, 0],
        setTransformPosition: () => {},
        hasComponent: () => false,
        spawnPrefab: () => uid(90),
        raycast: () => null,
        setBodyVelocity: () => {},
      },
      services: {
        save,
        platform: platformGraph,
        debug: { log: (message) => console.info(`[haku graph] ${message}`) },
      },
    },
    [
      (registry) => registerPoolRuntimeAdapters(registry, pools),
      (registry) => registerUIRuntimeAdapters(registry, ui.service),
      (registry) => registerAudioRuntimeAdapters(registry, audio),
    ],
  )
  const effects: CheckpointEffectRecord[] = []
  const scheduler = new EngineScheduler()
  const plan = diagnosticPlan(catalog, ui.statusTarget)
  const inputs = diagnosticInputs()
  const interpreter = new InterpreterExecutionBackend(runtimes)
  const instance = new GraphInstance({
    id: INSTANCE_ID,
    plan,
    registryFingerprint: plan.registryFingerprint,
    scheduler,
    effects: {
      apply: (effect) => effects.push(effect),
      reconcile: () => {},
    },
    backend: {
      execute(request) {
        const values = inputs[request.node.nodeType] ?? {}
        return interpreter.execute({
          ...request,
          readData: (portId) => values[portId],
        })
      },
    },
  })

  const renderDetails = (exportFiles = host.dataset.staticExport ?? 'pending') => {
    const effectKinds = [...new Set(effects.map((effect) => effect.kind))].sort()
    const trace = instance.trace.map(
      (entry) => `${entry.kind}:${entry.nodeId}`,
    )
    host.dataset.graphEffects = effectKinds.join(',')
    host.dataset.graphTrace = trace.join(',')
    details.textContent = [
      `Effects: ${effectKinds.join(', ') || 'pending'}`,
      `Trace: ${trace.join(' → ') || 'pending'}`,
      `Export: ${exportFiles}`,
      `Catalog: ${catalog.fingerprint()}`,
    ].join('\n')
  }

  const executeDirect = async (
    nodeType: string,
    properties: Readonly<Record<string, unknown>>,
    data: Readonly<Record<string, unknown>>,
  ): Promise<NodeExecutionResult> => {
    const node = planNode(catalog, uid(70 + effects.length), nodeType, properties)
    const request = directRequest(node, data)
    const result = runtimes.require(nodeType, '1').execute(request)
    if (isCheckpointableTask(result)) return await result.task
    return await result
  }

  const runGraph = async (): Promise<void> => {
    host.dataset.graphStatus = 'running'
    status.textContent = 'Running cross-service graph…'
    try {
      const first = pool.acquire()
      if (!first) throw new Error('Pool did not provide its prewarmed lease')
      const released = await executeDirect(
        POOL_GRAPH_CONTRACTS.release.nodeType,
        {},
        { [POOL_GRAPH_CONTRACTS.release.ports.handle]: first },
      )
      for (const effect of released.effects ?? []) effects.push(effect)
      const second = pool.acquire()
      if (!second) throw new Error('Pool did not reacquire its released lease')
      host.dataset.poolReused = String(second.entity === first.entity)
      pool.release(second)

      await instance.start(NODE_IDS.random)
      await instance.start(NODE_IDS.platform)
      await instance.start(NODE_IDS.start)
      for (let frame = 0; frame < 3; frame += 1) {
        scheduler.runFrame(world, 1 / 60)
        await instance.idle()
      }

      const persisted = await save.load('m10f.sequence')
      host.dataset.savePersisted = String(
        JSON.stringify(persisted) === JSON.stringify({ value: 17 }),
      )
      host.dataset.platformAudio = String(
        await platformGraph.hasCapability('audio'),
      )
      if (
        host.dataset.poolReused !== 'true' ||
        host.dataset.savePersisted !== 'true' ||
        host.dataset.platformAudio !== 'true'
      ) {
        throw new Error('Cross-service state did not satisfy the diagnostic')
      }
      host.dataset.graphStatus = 'passed'
      status.textContent = 'M10f graph services passed'
      renderDetails()
    } catch (error) {
      host.dataset.graphStatus = 'failed'
      status.textContent = error instanceof Error ? error.message : String(error)
      renderDetails()
      throw error
    }
  }

  const runExport = async (): Promise<void> => {
    host.dataset.staticExport = 'running'
    renderDetails('running')
    try {
      const report = await (
        options.runStaticExport ?? runCrossServiceStaticExportFixture
      )()
      host.dataset.staticExport = report.files.join(',')
      renderDetails(host.dataset.staticExport)
    } catch (error) {
      host.dataset.staticExport = 'failed'
      const message = error instanceof Error ? error.message : String(error)
      status.textContent = message
      renderDetails('failed')
      throw error
    }
  }

  const runButton = host.querySelector<HTMLButtonElement>(
    '[data-cross-service-action="run"]',
  )!
  const exportButton = host.querySelector<HTMLButtonElement>(
    '[data-cross-service-action="export"]',
  )!
  const reportFailure = (error: unknown): void => {
    console.error('[haku] M10f cross-service diagnostic failed', error)
  }
  runButton.addEventListener('click', () => void runGraph().catch(reportFailure))
  exportButton.addEventListener(
    'click',
    () => void runExport().catch(reportFailure),
  )
  renderDetails()

  return {
    runGraph,
    runExport,
    destroy() {
      instance.destroy()
      platform.stop()
      audioDiagnostic.destroy()
      ui.destroy()
      audioRuntime.dispose()
      host.replaceChildren()
    },
  }
}

function isCheckpointableTask(
  value:
    | NodeExecutionResult
    | Promise<NodeExecutionResult>
    | CheckpointableAsyncTask,
): value is CheckpointableAsyncTask {
  return (
    typeof value === 'object' &&
    value !== null &&
    'task' in value &&
    value.task instanceof Promise
  )
}

function diagnosticPlan(
  catalog: NodeRegistry,
  uiTarget: { readonly document: string; readonly element: string },
): GraphExecutionPlan {
  const nodes = [
    planNode(catalog, NODE_IDS.start, FOUNDATION_GRAPH_IDS.onStart.nodeType),
    planNode(
      catalog,
      NODE_IDS.pool,
      POOL_GRAPH_CONTRACTS.acquire.nodeType,
      { poolId: POOL_ID },
      'FixedGameplay',
    ),
    planNode(
      catalog,
      NODE_IDS.ui,
      UI_GRAPH_CONTRACTS.setText.nodeType,
      { documentId: uiTarget.document, elementId: uiTarget.element },
      'Presentation',
    ),
    planNode(
      catalog,
      NODE_IDS.audio,
      AUDIO_GRAPH_CONTRACTS.setBusVolume.nodeType,
      { bus: 'ui' },
    ),
    planNode(
      catalog,
      NODE_IDS.save,
      SERVICE_GRAPH_CONTRACTS.saveValue.nodeType,
      { key: 'm10f.sequence' },
    ),
    planNode(
      catalog,
      NODE_IDS.random,
      DETERMINISTIC_GRAPH_CONTRACTS.randomNumber.nodeType,
    ),
    planNode(
      catalog,
      NODE_IDS.platform,
      SERVICE_GRAPH_CONTRACTS.hasPlatformCapability.nodeType,
      { capability: 'audio' },
    ),
  ]
  const connections = [
    flowConnection(
      1,
      NODE_IDS.start,
      FOUNDATION_GRAPH_IDS.onStart.ports.next,
      NODE_IDS.pool,
      POOL_GRAPH_CONTRACTS.acquire.ports.flowIn,
      'queue-flow',
    ),
    flowConnection(
      2,
      NODE_IDS.pool,
      POOL_GRAPH_CONTRACTS.acquire.ports.flowOut,
      NODE_IDS.ui,
      UI_GRAPH_CONTRACTS.setText.ports.flowIn,
      'queue-flow',
    ),
    flowConnection(
      3,
      NODE_IDS.ui,
      UI_GRAPH_CONTRACTS.setText.ports.flowOut,
      NODE_IDS.audio,
      AUDIO_GRAPH_CONTRACTS.setBusVolume.ports.flowIn,
      'queue-flow',
    ),
    flowConnection(
      4,
      NODE_IDS.audio,
      AUDIO_GRAPH_CONTRACTS.setBusVolume.ports.flowOut,
      NODE_IDS.save,
      SERVICE_GRAPH_CONTRACTS.saveValue.ports.flowIn,
      'flow',
    ),
  ]
  return {
    schemaVersion: 1,
    graphId: GRAPH_ID,
    registryFingerprint: catalog.fingerprint(),
    planFingerprint: 'm10f-cross-service-diagnostic-v1',
    nodes,
    connections,
    publicInterface: { ports: [] },
    subgraphs: [],
    checkpoints: [],
    checkpointEligible: false,
  }
}

function planNode(
  catalog: NodeRegistry,
  id: string,
  nodeType: string,
  properties: Readonly<Record<string, unknown>> = {},
  domain: ExecutionPlanNode['domain'] = 'FrameGameplay',
): ExecutionPlanNode {
  const definition = catalog.require(nodeType)
  return {
    id,
    nodeType,
    version: definition.contract.version,
    kind: definition.contract.kind,
    domain,
    order: 0,
    typeArguments: {},
    properties,
    reads: definition.contract.reads,
    writes: definition.contract.writes,
    effects: definition.contract.effects,
    execution: definition.contract.execution,
    exportedState: definition.contract.exportedState,
    checkpoint: analyzeNodeCheckpointEligibility(definition),
  }
}

function flowConnection(
  id: number,
  fromNode: string,
  fromCallsite: string,
  toNode: string,
  toCallsite: string,
  operation: 'flow' | 'queue-flow',
): GraphExecutionPlan['connections'][number] {
  return {
    id: uid(50 + id),
    kind: 'flow',
    operation,
    from: { node: fromNode, callsite: fromCallsite },
    to: { node: toNode, callsite: toCallsite },
  }
}

function diagnosticInputs(): Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> {
  return {
    [AUDIO_GRAPH_CONTRACTS.setBusVolume.nodeType]: {
      [AUDIO_GRAPH_CONTRACTS.setBusVolume.ports.value]: 0.4,
    },
    [SERVICE_GRAPH_CONTRACTS.saveValue.nodeType]: {
      [SERVICE_GRAPH_CONTRACTS.saveValue.ports.value]: { value: 17 },
    },
    [DETERMINISTIC_GRAPH_CONTRACTS.randomNumber.nodeType]: {
      [DETERMINISTIC_GRAPH_CONTRACTS.randomNumber.ports.min]: 0,
      [DETERMINISTIC_GRAPH_CONTRACTS.randomNumber.ports.max]: 1,
    },
    [UI_GRAPH_CONTRACTS.setText.nodeType]: {
      [UI_GRAPH_CONTRACTS.setText.ports.value]: 'Graph UI mutation complete',
    },
  }
}

function directRequest(
  node: ExecutionPlanNode,
  inputs: Readonly<Record<string, unknown>>,
): NodeExecutionRequest {
  return {
    instanceId: INSTANCE_ID,
    graphId: GRAPH_ID,
    node,
    phase: node.domain,
    tickNumber: 0,
    frameNumber: 0,
    snapshot: {
      id: 0,
      key: 'm10f-direct',
      phase: node.domain,
      tickNumber: 0,
      frameNumber: 0,
      resourceVersions: {},
    },
    signal: new AbortController().signal,
    getParameter: () => undefined,
    readResource: () => undefined,
    readData: (portId) => inputs[portId],
    readNodeRef: () => undefined,
    runSubgraph: () => ({ instanceId: 'unused', outputs: {} }),
    spawnChild: (task) => task(new AbortController().signal),
  }
}
