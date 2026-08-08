import {
  type EngineScheduler,
  type SchedulerCommand,
  type SchedulerPhase,
} from '@haku/core'
import {
  type AsyncCheckpointPolicy,
  type CheckpointStateScope,
  type ExecutionPlanCheckpoint,
  type ExecutionPlanNode,
  type GraphExecutionPlan,
  type GraphPublicPort,
  stableFingerprint,
} from '@haku/graph'
import {
  NodeRuntimeRegistry,
  type CheckpointableAsyncTask,
  type CheckpointableTaskAdapter,
  type CheckpointEffectRecord,
  type ExecutionSnapshot,
  type NodeExecutionInput,
  type NodeExecutionRequest,
  type NodeExecutionResult,
  type NodeLifecycleAction,
  type NodeLifecycleRequest,
  type NodeReference,
  type ResourceSnapshotProvider,
  type SubgraphExecutionResult,
  type SubgraphInvocation,
} from './runtime-adapter.js'

export {
  NodeRuntimeRegistry,
  checkpointableTask,
  type CancelFallbackKind,
  type CheckpointableAsyncTask,
  type CheckpointableTaskAdapter,
  type CheckpointEffectRecord,
  type ExecutionSnapshot,
  type NodeExecutionInput,
  type NodeExecutionRequest,
  type NodeExecutionResult,
  type NodeLifecycleAction,
  type NodeLifecycleRequest,
  type NodeReference,
  type NodeRuntimeAdapter,
  type ReconnectCheckpointAdapter,
  type ResourceSnapshotProvider,
  type RestartCheckpointAdapter,
  type ResumeCheckpointAdapter,
  type SubgraphExecutionResult,
  type SubgraphInvocation,
} from './runtime-adapter.js'

export {
  registerCustomComponentRuntimeAdapters,
  type CustomComponentRuntimeOptions,
} from './custom-component-runtime.js'

export { registerFoundationRuntimeAdapters } from './foundation-runtime.js'

export {
  createGraphVariableStore,
  createSeededRandomService,
  registerDeterministicRuntimeAdapters,
  type DeterministicRuntimeServices,
  type GraphVariableStore,
  type SeededRandomCheckpoint,
  type SeededRandomService,
} from './deterministic-runtime.js'

export {
  registerWorldRuntimeAdapters,
  type WorldGraphService,
} from './world-runtime.js'

export {
  GraphAssertionError,
  registerCrossServiceRuntimeAdapters,
  type CrossServiceRuntimeServices,
  type DebugGraphService,
  type PlatformGraphService,
  type SaveGraphService,
} from './cross-service-runtime.js'

export {
  createDeterministicResourceSnapshotProvider,
  createFoundationRuntimeRegistry,
  type FoundationRuntimeServices,
  type RuntimeAdapterRegistrar,
} from './foundation-runtime-catalog.js'

export class GraphRuntimeError extends Error {
  readonly code: string
  readonly graphId: string
  readonly instanceId: string
  readonly nodeId: string
  readonly phase: SchedulerPhase
  readonly tickNumber: number
  readonly frameNumber: number
  override readonly cause?: unknown

  constructor(options: {
    readonly code: string
    readonly message: string
    readonly graphId: string
    readonly instanceId: string
    readonly nodeId: string
    readonly phase: SchedulerPhase
    readonly tickNumber: number
    readonly frameNumber: number
    readonly cause?: unknown
  }) {
    super(options.message)
    this.name = 'GraphRuntimeError'
    this.code = options.code
    this.graphId = options.graphId
    this.instanceId = options.instanceId
    this.nodeId = options.nodeId
    this.phase = options.phase
    this.tickNumber = options.tickNumber
    this.frameNumber = options.frameNumber
    this.cause = options.cause
  }
}

export class CheckpointPolicyError extends Error {
  readonly code: string
  readonly callsiteId?: string

  constructor(code: string, message: string, callsiteId?: string) {
    super(message)
    this.name = 'CheckpointPolicyError'
    this.code = code
    this.callsiteId = callsiteId
  }
}

export interface ExecutionBackend {
  execute(
    request: NodeExecutionRequest,
  ): NodeExecutionResult | Promise<NodeExecutionResult> | CheckpointableAsyncTask
  lifecycle?(request: NodeLifecycleRequest): void
  restoreCheckpointTask?(
    request: RestoreCheckpointTaskRequest,
  ): NodeExecutionResult | Promise<NodeExecutionResult>
}

export class InterpreterExecutionBackend implements ExecutionBackend {
  constructor(private readonly registry: NodeRuntimeRegistry) {}

  execute(
    request: NodeExecutionRequest,
  ): NodeExecutionResult | Promise<NodeExecutionResult> | CheckpointableAsyncTask {
    return this.registry
      .require(request.node.nodeType, request.node.version)
      .execute(request)
  }

  lifecycle(request: NodeLifecycleRequest): void {
    this.registry
      .require(request.node.nodeType, request.node.version)
      .lifecycle?.(request)
  }
}

export type ExecutionTraceKind =
  | 'node-start'
  | 'node-complete'
  | 'queue'
  | 'task-start'
  | 'task-complete'
  | 'task-cancel'
  | 'node-error'
  | 'runaway'

export interface ExecutionTraceEntry {
  readonly kind: ExecutionTraceKind
  readonly sequence: number
  readonly instanceId: string
  readonly graphId: string
  readonly nodeId: string
  readonly phase: SchedulerPhase
  readonly tickNumber: number
  readonly frameNumber: number
  readonly connectionId?: string
  readonly input?: {
    readonly callsiteId: string
    readonly kind: 'flow' | 'event'
  }
  readonly outputs?: {
    readonly flow: readonly string[]
    readonly data: readonly string[]
    readonly events: readonly string[]
    readonly publicOutputs: readonly string[]
    readonly publicEvents: readonly string[]
  }
  readonly effects: ExecutionPlanNode['effects']
}

export interface GraphInstanceOptions {
  readonly id: string
  readonly plan: GraphExecutionPlan
  readonly registryFingerprint: string
  readonly scheduler: EngineScheduler
  readonly backend: ExecutionBackend
  readonly expectedPlanFingerprint?: string
  readonly subgraphPlans?: ReadonlyMap<string, GraphExecutionPlan>
  readonly resources?: ResourceSnapshotProvider
  readonly effects?: CheckpointEffectReconciler
  readonly persistence?: CheckpointPersistenceOptions
  readonly limits?: Partial<GraphRuntimeLimits>
}

export type CheckpointPersistencePolicy =
  | 'memory-only'
  | 'persist-automatically'
  | 'persist-explicitly'

const CHECKPOINT_PERSISTENCE_POLICIES: readonly CheckpointPersistencePolicy[] = [
  'memory-only',
  'persist-automatically',
  'persist-explicitly',
]

export interface CheckpointReference {
  readonly id: string
  readonly fingerprint: string
}

export interface SaveService {
  saveCheckpoint(
    slotId: string,
    record: PersistentCheckpointRecord,
  ): Promise<void>
  loadCheckpoint(
    slotId: string,
    instanceId: string,
  ): Promise<PersistentCheckpointRecord | undefined>
}

export interface CheckpointPersistenceOptions {
  readonly saveService: SaveService
  readonly slotId: string
  readonly policy?: CheckpointPersistencePolicy
  readonly references?: readonly CheckpointReference[]
  readonly migrations?: CheckpointMigrationRegistry
  readonly fallbackEntryNodeId: string
}

export interface PersistentCheckpointSnapshot {
  readonly parameters: readonly (readonly [string, unknown])[]
  readonly outputs: readonly (readonly [string, unknown])[]
  readonly exportedState: readonly (
    readonly [string, readonly (readonly [string, unknown])[]]
  )[]
  readonly resources: readonly (readonly [string, unknown])[]
  readonly effects: readonly CheckpointEffectRecord[]
  readonly asyncRecords: readonly AsyncCheckpointRecord[]
}

export interface PersistentCheckpointRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly label: string
  readonly graphId: string
  readonly instanceId: string
  readonly checkpointNodeId: string
  readonly planFingerprint: string
  readonly registryFingerprint: string
  readonly scopeFingerprint: string
  readonly references: readonly CheckpointReference[]
  readonly tickNumber: number
  readonly frameNumber: number
  readonly scope: CheckpointStateScope
  readonly snapshot: PersistentCheckpointSnapshot
  readonly checksum: string
}

export interface CheckpointMigration {
  readonly graphId: string
  readonly fromPlanFingerprint: string
  readonly toPlanFingerprint: string
  migrate(record: PersistentCheckpointRecord): PersistentCheckpointRecord
}

export class CheckpointMigrationRegistry {
  private readonly migrations = new Map<string, CheckpointMigration>()

  register(migration: CheckpointMigration): void {
    const key = checkpointMigrationKey(
      migration.graphId,
      migration.fromPlanFingerprint,
      migration.toPlanFingerprint,
    )
    if (this.migrations.has(key)) {
      throw new Error(`Duplicate checkpoint migration ${key}`)
    }
    this.migrations.set(key, migration)
  }

  find(
    graphId: string,
    fromPlanFingerprint: string,
    toPlanFingerprint: string,
  ): CheckpointMigration | undefined {
    return this.migrations.get(checkpointMigrationKey(
      graphId,
      fromPlanFingerprint,
      toPlanFingerprint,
    ))
  }
}

export interface RestoreCheckpointResult {
  readonly status: 'restored' | 'fallback' | 'missing'
  readonly checkpointId?: string
  readonly reason?: string
}

export interface CheckpointEffectReconciler {
  apply(record: CheckpointEffectRecord): void
  reconcile(records: readonly CheckpointEffectRecord[]): void
}

export interface GraphRuntimeLimits {
  readonly maxStepsPerExecution: number
  readonly maxTraceEntries: number
}

export type GraphInstanceStatus =
  | 'inactive'
  | 'active'
  | 'stopped'
  | 'destroyed'

interface QueuedInvocation {
  readonly instanceId: string
  readonly nodeId: string
  readonly inputCallsiteId: string
  readonly generation: number
  readonly kind: 'flow' | 'event'
  readonly value?: unknown
  readonly budget: ExecutionBudget
}

interface SnapshotState extends ExecutionSnapshot {
  readonly parameters: ReadonlyMap<string, unknown>
  readonly resources: ReadonlyMap<string, unknown>
}

interface ExecutionBudget {
  steps: number
}

type EventSubscriber = (value: unknown) => void

export interface GraphCheckpoint {
  readonly id: string
  readonly label: string
  readonly graphId: string
  readonly instanceId: string
  readonly checkpointNodeId: string
  readonly planFingerprint: string
  readonly tickNumber: number
  readonly frameNumber: number
  readonly queueSequence: number
  readonly scope: CheckpointStateScope
  readonly asyncRecords: readonly AsyncCheckpointRecord[]
}

interface ActiveGraphCheckpoint extends GraphCheckpoint {
  readonly parameters: ReadonlyMap<string, unknown>
  readonly outputs: ReadonlyMap<string, unknown>
  readonly exportedState: ReadonlyMap<string, ReadonlyMap<string, unknown>>
  readonly resources: ReadonlyMap<string, unknown>
  readonly effects: readonly CheckpointEffectRecord[]
}

export interface AsyncCheckpointPolicySelection {
  readonly callsiteId: string
  readonly policy: AsyncCheckpointPolicy
  readonly timeoutMs?: number
}

export interface CreateCheckpointOptions {
  readonly asyncPolicies?: readonly AsyncCheckpointPolicySelection[]
}

export interface AsyncCheckpointRecord {
  readonly nodeId: string
  readonly callsiteId: string
  readonly policy: Exclude<
    AsyncCheckpointPolicy,
    'wait' | 'reject' | 'cancel-fallback'
  >
  readonly payload: unknown
}

export interface RestoreCheckpointTaskRequest {
  readonly instanceId: string
  readonly graphId: string
  readonly node: ExecutionPlanNode
  readonly record: AsyncCheckpointRecord
  readonly signal: AbortSignal
}

interface LiveAsyncTask {
  readonly node: ExecutionPlanNode
  readonly callsiteIds: readonly string[]
  readonly promise: Promise<NodeExecutionResult>
  readonly adapter?: CheckpointableTaskAdapter
  cancelled: boolean
  cancelRecorded: boolean
}

export class GraphInstance {
  readonly id: string
  readonly plan: GraphExecutionPlan

  private readonly scheduler: EngineScheduler
  private readonly backend: ExecutionBackend
  private readonly nodes: ReadonlyMap<string, ExecutionPlanNode>
  private readonly publicPorts: ReadonlyMap<string, GraphPublicPort>
  private readonly subgraphPlans: ReadonlyMap<string, GraphExecutionPlan>
  private readonly resources?: ResourceSnapshotProvider
  private readonly effectReconciler?: CheckpointEffectReconciler
  private readonly persistence?: CheckpointPersistenceOptions & {
    readonly policy: CheckpointPersistencePolicy
    readonly references: readonly CheckpointReference[]
  }
  private readonly limits: GraphRuntimeLimits
  private scopeController = new AbortController()
  private readonly traceEntries: ExecutionTraceEntry[] = []
  private traceWriteIndex = 0
  private readonly parameters = new Map<string, unknown>()
  private readonly outputs = new Map<string, unknown>()
  private readonly exportedState = new Map<string, ReadonlyMap<string, unknown>>()
  private readonly subscribers = new Map<string, Set<EventSubscriber>>()
  private readonly dataCache = new Map<string, NodeExecutionResult>()
  private readonly resourceVersions = new Map<string, number>()
  private readonly childInstances: GraphInstance[] = []
  private readonly ownedTasks = new Set<Promise<unknown>>()
  private readonly liveAsyncTasks = new Set<LiveAsyncTask>()
  private readonly materializedResults = new Map<string, NodeExecutionResult>()
  private readonly effectJournal = new Map<string, CheckpointEffectRecord>()
  private readonly deliveredEffectIds = new Set<string>()
  private nextTraceSequence = 0
  private nextSnapshotId = 0
  private parameterRevision = 0
  private nextSubgraphSequence = 0
  private generation = 0
  private _status: GraphInstanceStatus = 'inactive'
  private activeCheckpoint?: ActiveGraphCheckpoint
  private nextCheckpointSequence = 0

  constructor(options: GraphInstanceOptions) {
    if (options.plan.registryFingerprint !== options.registryFingerprint) {
      throw new Error(
        `Graph plan ${options.plan.graphId} is incompatible with the runtime registry`,
      )
    }
    if (
      options.expectedPlanFingerprint !== undefined &&
      options.plan.planFingerprint !== options.expectedPlanFingerprint
    ) {
      throw new Error(
        `Graph plan ${options.plan.graphId} has unexpected fingerprint ${options.plan.planFingerprint}`,
      )
    }
    this.id = options.id
    this.plan = options.plan
    this.scheduler = options.scheduler
    this.backend = options.backend
    this.subgraphPlans = options.subgraphPlans ?? new Map()
    this.resources = options.resources
    this.effectReconciler = options.effects
    if (options.persistence) {
      const policy = options.persistence.policy ?? 'persist-automatically'
      if (!CHECKPOINT_PERSISTENCE_POLICIES.includes(policy)) {
        throw new Error(`Unknown checkpoint persistence policy: ${policy}`)
      }
      if (!options.persistence.slotId) {
        throw new Error('Checkpoint persistence slotId must not be empty')
      }
      this.persistence = {
        ...options.persistence,
        policy,
        references: normalizeCheckpointReferences(
          options.persistence.references ?? [],
        ),
      }
    }
    this.limits = {
      maxStepsPerExecution: options.limits?.maxStepsPerExecution ?? 1_000,
      maxTraceEntries: options.limits?.maxTraceEntries ?? 4_096,
    }
    if (
      !Number.isInteger(this.limits.maxStepsPerExecution) ||
      this.limits.maxStepsPerExecution <= 0
    ) {
      throw new Error('maxStepsPerExecution must be a positive integer')
    }
    if (!Number.isInteger(this.limits.maxTraceEntries) || this.limits.maxTraceEntries <= 0) {
      throw new Error('maxTraceEntries must be a positive integer')
    }
    this.nodes = new Map(options.plan.nodes.map((node) => [node.id, node]))
    if (
      this.persistence &&
      !this.nodes.has(this.persistence.fallbackEntryNodeId)
    ) {
      throw new Error(
        `Unknown checkpoint fallback entry ${this.persistence.fallbackEntryNodeId}`,
      )
    }
    this.publicPorts = new Map(
      options.plan.publicInterface.ports.map((port) => [port.id, port]),
    )
    this.runLifecycle('create', options.plan.nodes)
  }

  get trace(): readonly ExecutionTraceEntry[] {
    if (this.traceEntries.length < this.limits.maxTraceEntries || this.traceWriteIndex === 0) {
      return this.traceEntries
    }
    return [
      ...this.traceEntries.slice(this.traceWriteIndex),
      ...this.traceEntries.slice(0, this.traceWriteIndex),
    ]
  }

  get status(): GraphInstanceStatus {
    return this._status
  }

  get checkpoint(): GraphCheckpoint | undefined {
    if (!this.activeCheckpoint) return undefined
    const {
      parameters: _parameters,
      outputs: _outputs,
      exportedState: _exportedState,
      resources: _resources,
      effects: _effects,
      ...record
    } = this.activeCheckpoint
    return record
  }

  setParameter(portId: string, value: unknown): void {
    const port = this.requirePublicPort(portId, 'input', 'data')
    this.parameters.set(port.id, cloneValue(value))
    this.parameterRevision += 1
  }

  getParameter(portId: string): unknown {
    const port = this.requirePublicPort(portId, 'input', 'data')
    return cloneValue(this.parameters.get(port.id))
  }

  async createCheckpoint(
    checkpointNodeId: string,
    label: string,
    options: CreateCheckpointOptions = {},
  ): Promise<GraphCheckpoint> {
    const metadata = this.plan.checkpoints.find(
      (checkpoint) => checkpoint.nodeId === checkpointNodeId,
    )
    if (!metadata) {
      throw new Error(`Unknown checkpoint node ${checkpointNodeId}`)
    }
    if (!metadata.eligible) {
      throw new Error(
        `Checkpoint ${checkpointNodeId} is ineligible: ${metadata.dependencies
          .flatMap((dependency) => dependency.causalChain)
          .join(' -> ')}`,
      )
    }
    if (metadata.stateScope.unbounded) {
      throw new Error(`Checkpoint ${checkpointNodeId} has an unbounded state scope`)
    }
    const asyncRecords = await this.applyCheckpointPolicies(
      metadata,
      options.asyncPolicies ?? [],
    )
    const scopedNodes = new Set(metadata.stateScope.nodes)
    const record: ActiveGraphCheckpoint = {
      id: `${this.id}:checkpoint:${this.nextCheckpointSequence++}`,
      label,
      graphId: this.plan.graphId,
      instanceId: this.id,
      checkpointNodeId,
      planFingerprint: this.plan.planFingerprint,
      tickNumber: this.scheduler.tickNumber,
      frameNumber: this.scheduler.frameNumber,
      queueSequence: this.scheduler.captureQueueSequence(),
      scope: cloneValue(metadata.stateScope),
      asyncRecords,
      parameters: cloneMap(this.parameters),
      outputs: cloneMap(this.outputs),
      exportedState: new Map(
        [...this.exportedState]
          .filter(([nodeId]) => scopedNodes.has(nodeId))
          .map(([nodeId, state]) => [nodeId, cloneMap(state)]),
      ),
      resources: new Map(
        metadata.stateScope.resources.map((resource) => [
          resource,
          cloneValue(this.resources?.snapshot(resource)),
        ]),
      ),
      effects: [...this.effectJournal.values()]
        .filter((effect) => {
          const nodeId = effectNodeId(effect)
          return nodeId !== undefined && scopedNodes.has(nodeId)
        })
        .map(cloneValue)
        .sort((left, right) => left.id.localeCompare(right.id)),
    }
    this.activeCheckpoint = record
    if (this.persistence?.policy === 'persist-automatically') {
      await this.persistCheckpoint()
    }
    return this.checkpoint!
  }

  async persistCheckpoint(): Promise<PersistentCheckpointRecord> {
    if (!this.persistence) {
      throw new Error(`Graph instance ${this.id} has no SaveService`)
    }
    if (this.persistence.policy === 'memory-only') {
      throw new Error(`Graph instance ${this.id} checkpoint is memory-only`)
    }
    const checkpoint = this.activeCheckpoint
    if (!checkpoint) {
      throw new Error(`Graph instance ${this.id} has no active checkpoint`)
    }
    const record = this.createPersistentRecord(checkpoint)
    await this.persistence.saveService.saveCheckpoint(
      this.persistence.slotId,
      record,
    )
    return record
  }

  async restoreCheckpoint(): Promise<RestoreCheckpointResult> {
    if (!this.persistence) {
      throw new Error(`Graph instance ${this.id} has no SaveService`)
    }
    if (this.persistence.policy === 'memory-only') {
      throw new Error(`Graph instance ${this.id} checkpoint is memory-only`)
    }
    const loaded = await this.persistence.saveService.loadCheckpoint(
      this.persistence.slotId,
      this.id,
    )
    if (!loaded) return { status: 'missing' }

    try {
      const record = this.preparePersistentRecord(loaded)
      this.restorePersistentRecord(record)
      return { status: 'restored', checkpointId: record.id }
    } catch (error) {
      const reason = errorMessage(error)
      const execution = this.start(this.persistence.fallbackEntryNodeId)
      if (execution instanceof Promise) await execution
      return { status: 'fallback', reason }
    }
  }

  private createPersistentRecord(
    checkpoint: ActiveGraphCheckpoint,
  ): PersistentCheckpointRecord {
    const withoutChecksum: Omit<PersistentCheckpointRecord, 'checksum'> = {
      schemaVersion: 1,
      id: checkpoint.id,
      label: checkpoint.label,
      graphId: checkpoint.graphId,
      instanceId: checkpoint.instanceId,
      checkpointNodeId: checkpoint.checkpointNodeId,
      planFingerprint: checkpoint.planFingerprint,
      registryFingerprint: this.plan.registryFingerprint,
      scopeFingerprint: stableFingerprint(checkpoint.scope),
      references: this.persistence?.references ?? [],
      tickNumber: checkpoint.tickNumber,
      frameNumber: checkpoint.frameNumber,
      scope: cloneValue(checkpoint.scope),
      snapshot: {
        parameters: mapEntries(checkpoint.parameters),
        outputs: mapEntries(checkpoint.outputs),
        exportedState: [...checkpoint.exportedState]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([nodeId, state]) => [nodeId, mapEntries(state)] as const),
        resources: mapEntries(checkpoint.resources),
        effects: checkpoint.effects.map(cloneValue),
        asyncRecords: checkpoint.asyncRecords.map(cloneValue),
      },
    }
    return {
      ...withoutChecksum,
      checksum: checksumCheckpointRecord(withoutChecksum),
    }
  }

  private preparePersistentRecord(
    loaded: PersistentCheckpointRecord,
  ): PersistentCheckpointRecord {
    if (loaded.schemaVersion !== 1) {
      throw new Error(
        `Unsupported checkpoint schema version ${String(loaded.schemaVersion)}`,
      )
    }
    if (loaded.checksum !== checksumCheckpointRecord(loaded)) {
      throw new Error(`Checkpoint ${loaded.id} checksum mismatch`)
    }
    if (loaded.graphId !== this.plan.graphId || loaded.instanceId !== this.id) {
      throw new Error(`Checkpoint ${loaded.id} targets another graph instance`)
    }

    let record = cloneValue(loaded)
    if (record.planFingerprint !== this.plan.planFingerprint) {
      const migration = this.persistence?.migrations?.find(
        record.graphId,
        record.planFingerprint,
        this.plan.planFingerprint,
      )
      if (!migration) {
        throw new Error(
          `Checkpoint ${record.id} has incompatible plan fingerprint ${record.planFingerprint}`,
        )
      }
      record = cloneValue(migration.migrate(record))
      if (
        record.graphId !== this.plan.graphId ||
        record.instanceId !== this.id ||
        record.planFingerprint !== this.plan.planFingerprint
      ) {
        throw new Error('Checkpoint migration returned an incompatible record')
      }
      record = {
        ...record,
        checksum: checksumCheckpointRecord({ ...record, checksum: '' }),
      }
    }
    if (record.registryFingerprint !== this.plan.registryFingerprint) {
      throw new Error(
        `Checkpoint ${record.id} has incompatible registry fingerprint`,
      )
    }
    const metadata = this.plan.checkpoints.find(
      (checkpoint) => checkpoint.nodeId === record.checkpointNodeId,
    )
    if (!metadata || !metadata.eligible) {
      throw new Error(
        `Checkpoint ${record.id} references an ineligible checkpoint node`,
      )
    }
    const expectedScopeFingerprint = stableFingerprint(metadata.stateScope)
    if (
      record.scopeFingerprint !== expectedScopeFingerprint ||
      stableFingerprint(record.scope) !== expectedScopeFingerprint
    ) {
      throw new Error(`Checkpoint ${record.id} scope fingerprint mismatch`)
    }
    if (!sameCheckpointReferences(
      record.references,
      this.persistence?.references ?? [],
    )) {
      throw new Error(`Checkpoint ${record.id} reference fingerprint mismatch`)
    }
    const asyncMetadata = metadata.asyncPolicies
    for (const asyncRecord of record.snapshot.asyncRecords) {
      const callsite = asyncMetadata.find(
        (candidate) =>
          candidate.nodeId === asyncRecord.nodeId &&
          candidate.callsiteId === asyncRecord.callsiteId,
      )
      if (!callsite || !callsite.supported.includes(asyncRecord.policy)) {
        throw new Error(
          `Checkpoint ${record.id} has invalid async policy callsite ${asyncRecord.callsiteId}`,
        )
      }
    }
    validatePersistentSnapshot(record)
    return record
  }

  private restorePersistentRecord(record: PersistentCheckpointRecord): void {
    const snapshot = record.snapshot
    const active: ActiveGraphCheckpoint = {
      id: record.id,
      label: record.label,
      graphId: record.graphId,
      instanceId: record.instanceId,
      checkpointNodeId: record.checkpointNodeId,
      planFingerprint: record.planFingerprint,
      tickNumber: record.tickNumber,
      frameNumber: record.frameNumber,
      queueSequence: this.scheduler.captureQueueSequence(),
      scope: cloneValue(record.scope),
      asyncRecords: record.snapshot.asyncRecords.map(cloneValue),
      parameters: new Map(snapshot.parameters.map(cloneValue)),
      outputs: new Map(snapshot.outputs.map(cloneValue)),
      exportedState: new Map(
        snapshot.exportedState.map(([nodeId, entries]) => [
          nodeId,
          new Map(entries.map(cloneValue)),
        ]),
      ),
      resources: new Map(snapshot.resources.map(cloneValue)),
      effects: snapshot.effects.map(cloneValue),
    }
    replaceMap(this.parameters, active.parameters)
    replaceMap(this.outputs, active.outputs)
    this.exportedState.clear()
    for (const [nodeId, state] of active.exportedState) {
      this.exportedState.set(nodeId, cloneMap(state))
    }
    for (const [resource, value] of active.resources) {
      if (!this.resources?.restore) {
        throw new Error(`Resource ${resource} does not support checkpoint restore`)
      }
      this.resources.restore(resource, cloneValue(value))
    }
    this.resources?.recompute?.(active.scope.resources)
    this.effectJournal.clear()
    for (const effect of active.effects) {
      this.effectJournal.set(effect.id, cloneValue(effect))
      this.deliveredEffectIds.add(effect.id)
    }
    this.effectReconciler?.reconcile(active.effects.map(cloneValue))
    this.activeCheckpoint = active
    this._status = 'active'
    const scopedNodes = new Set(active.scope.nodes)
    this.runLifecycle(
      'resume-from-checkpoint',
      this.plan.nodes.filter((node) => scopedNodes.has(node.id)),
    )
    for (const asyncRecord of active.asyncRecords) {
      if (asyncRecord.policy === 'materialized') continue
      if (!this.backend.restoreCheckpointTask) {
        throw new Error(
          `Checkpoint ${record.id} cannot restore ${asyncRecord.policy} async callsite ${asyncRecord.callsiteId}`,
        )
      }
      const node = this.nodes.get(asyncRecord.nodeId)
      if (!node) {
        throw new Error(
          `Checkpoint ${record.id} references missing async node ${asyncRecord.nodeId}`,
        )
      }
      this.restoreCheckpointTask(node, asyncRecord)
    }
  }

  private async applyCheckpointPolicies(
    metadata: ExecutionPlanCheckpoint,
    selections: readonly AsyncCheckpointPolicySelection[],
  ): Promise<readonly AsyncCheckpointRecord[]> {
    const byCallsite = new Map<string, AsyncCheckpointPolicySelection>()
    for (const selection of selections) {
      if (byCallsite.has(selection.callsiteId)) {
        throw new CheckpointPolicyError(
          'checkpoint.duplicate-callsite',
          `Checkpoint policy callsite ${selection.callsiteId} is duplicated`,
          selection.callsiteId,
        )
      }
      byCallsite.set(selection.callsiteId, selection)
    }
    for (const selection of selections) {
      const policyMetadata = metadata.asyncPolicies.find(
        (candidate) => candidate.callsiteId === selection.callsiteId,
      )
      if (!policyMetadata) {
        throw new CheckpointPolicyError(
          'checkpoint.unknown-callsite',
          `Checkpoint ${metadata.nodeId} has no async callsite ${selection.callsiteId}`,
          selection.callsiteId,
        )
      }
      if (!policyMetadata.supported.includes(selection.policy)) {
        throw new CheckpointPolicyError(
          'checkpoint.unsupported-policy',
          `Async callsite ${selection.callsiteId} does not support ${selection.policy}`,
          selection.callsiteId,
        )
      }
    }

    const records: AsyncCheckpointRecord[] = []
    for (const policyMetadata of metadata.asyncPolicies) {
      const task = [...this.liveAsyncTasks].find(
        (candidate) =>
          candidate.node.id === policyMetadata.nodeId &&
          candidate.callsiteIds.includes(policyMetadata.callsiteId) &&
          !candidate.cancelled,
      )
      const selection = byCallsite.get(policyMetadata.callsiteId)
      if (!task && selection?.policy !== 'materialized') continue
      if (!selection) {
        throw new CheckpointPolicyError(
          'checkpoint.missing-policy',
          `Live async callsite ${policyMetadata.callsiteId} requires a checkpoint policy`,
          policyMetadata.callsiteId,
        )
      }

      switch (selection.policy) {
        case 'wait': {
          if (!task) break
          if (
            selection.timeoutMs !== undefined &&
            (!Number.isFinite(selection.timeoutMs) || selection.timeoutMs <= 0)
          ) {
            throw new CheckpointPolicyError(
              'checkpoint.invalid-timeout',
              'Checkpoint wait timeout must be a positive finite number',
              selection.callsiteId,
            )
          }
          await waitForCheckpointTask(
            task.promise,
            selection.timeoutMs,
            selection.callsiteId,
          )
          break
        }
        case 'restart': {
          if (!task) break
          const adapter = task.adapter?.restart
          if (
            !adapter ||
            (adapter.safety !== 'pure' && adapter.safety !== 'idempotent')
          ) {
            throw new CheckpointPolicyError(
              'checkpoint.missing-policy-adapter',
              `Async callsite ${selection.callsiteId} has no restart adapter`,
              selection.callsiteId,
            )
          }
          records.push({
            nodeId: policyMetadata.nodeId,
            callsiteId: policyMetadata.callsiteId,
            policy: 'restart',
            payload: cloneValue({
              safety: adapter.safety,
              inputs: adapter.inputs(),
            }),
          })
          break
        }
        case 'resume': {
          if (!task) break
          const adapter = task.adapter?.resume
          if (!adapter?.stateMachineId) {
            throw new CheckpointPolicyError(
              'checkpoint.missing-policy-adapter',
              `Async callsite ${selection.callsiteId} has no declared state machine`,
              selection.callsiteId,
            )
          }
          records.push({
            nodeId: policyMetadata.nodeId,
            callsiteId: policyMetadata.callsiteId,
            policy: 'resume',
            payload: cloneValue({
              stateMachineId: adapter.stateMachineId,
              state: adapter.serialize(),
            }),
          })
          break
        }
        case 'reconnect': {
          if (!task) break
          const adapter = task.adapter?.reconnect
          if (!adapter?.operationId) {
            throw new CheckpointPolicyError(
              'checkpoint.missing-policy-adapter',
              `Async callsite ${selection.callsiteId} has no durable operation ID`,
              selection.callsiteId,
            )
          }
          records.push({
            nodeId: policyMetadata.nodeId,
            callsiteId: policyMetadata.callsiteId,
            policy: 'reconnect',
            payload: cloneValue({
              operationId: adapter.operationId,
              status: adapter.status(),
            }),
          })
          break
        }
        case 'materialized': {
          if (task) {
            throw new CheckpointPolicyError(
              'checkpoint.result-not-materialized',
              `Async callsite ${selection.callsiteId} has not completed`,
              selection.callsiteId,
            )
          }
          const result = this.materializedResults.get(selection.callsiteId)
          if (!result) {
            throw new CheckpointPolicyError(
              'checkpoint.result-not-materialized',
              `Async callsite ${selection.callsiteId} has no materialized result`,
              selection.callsiteId,
            )
          }
          records.push({
            nodeId: policyMetadata.nodeId,
            callsiteId: policyMetadata.callsiteId,
            policy: 'materialized',
            payload: cloneValue(result),
          })
          break
        }
        case 'cancel-fallback': {
          if (!task) break
          if (!task.adapter?.cancel || !task.adapter.fallback) {
            throw new CheckpointPolicyError(
              'checkpoint.missing-policy-adapter',
              `Async callsite ${selection.callsiteId} has no typed fallback adapter`,
              selection.callsiteId,
            )
          }
          task.cancelled = true
          task.adapter.cancel()
          this.recordTaskCancellation(task)
          const snapshot = this.createSnapshot(task.node.domain)
          const completed = this.completeNode(
            task.node,
            cloneValue(task.adapter.fallback.result),
            snapshot,
            { steps: 0 },
          )
          if (completed instanceof Promise) await completed
          break
        }
        case 'reject':
          if (task) {
            throw new CheckpointPolicyError(
              'checkpoint.async-rejected',
              `Checkpoint rejected by live async callsite ${selection.callsiteId}`,
              selection.callsiteId,
            )
          }
          break
      }
    }
    return records.sort((left, right) =>
      left.callsiteId.localeCompare(right.callsiteId),
    )
  }

  rewind(): void {
    const checkpoint = this.activeCheckpoint
    if (!checkpoint) throw new Error(`Graph instance ${this.id} has no active checkpoint`)
    if (checkpoint.planFingerprint !== this.plan.planFingerprint) {
      throw new Error(`Checkpoint ${checkpoint.id} has an incompatible plan fingerprint`)
    }
    const scopedNodes = new Set(checkpoint.scope.nodes)
    this.runLifecycle(
      'before-rewind',
      this.plan.nodes.filter((node) => scopedNodes.has(node.id)),
    )
    this.generation += 1
    this.scopeController.abort()
    this.scopeController = new AbortController()
    this.scheduler.removeQueuedAfter(
      checkpoint.queueSequence,
      (command) =>
        isQueuedInvocation(command.payload) &&
        command.payload.instanceId === this.id,
    )
    replaceMap(this.parameters, checkpoint.parameters)
    replaceMap(this.outputs, checkpoint.outputs)
    for (const nodeId of scopedNodes) this.exportedState.delete(nodeId)
    for (const [nodeId, state] of checkpoint.exportedState) {
      this.exportedState.set(nodeId, cloneMap(state))
    }
    for (const [resource, value] of checkpoint.resources) {
      if (!this.resources?.restore) {
        throw new Error(`Resource ${resource} does not support checkpoint restore`)
      }
      this.resources.restore(resource, cloneValue(value))
    }
    this.dataCache.clear()
    this.resources?.recompute?.(checkpoint.scope.resources)
    this.effectJournal.clear()
    for (const effect of checkpoint.effects) {
      this.effectJournal.set(effect.id, cloneValue(effect))
    }
    this.effectReconciler?.reconcile(checkpoint.effects.map(cloneValue))
    for (const record of checkpoint.asyncRecords) {
      if (record.policy === 'materialized') continue
      if (!this.backend.restoreCheckpointTask) {
        throw new Error(
          `Checkpoint ${checkpoint.id} cannot restore ${record.policy} async callsite ${record.callsiteId}`,
        )
      }
      const node = this.nodes.get(record.nodeId)
      if (!node) {
        throw new Error(
          `Checkpoint ${checkpoint.id} references missing async node ${record.nodeId}`,
        )
      }
      this.restoreCheckpointTask(node, record)
    }
    this.runLifecycle(
      'after-rewind',
      this.plan.nodes.filter((node) => scopedNodes.has(node.id)),
    )
  }

  private restoreCheckpointTask(
    node: ExecutionPlanNode,
    record: AsyncCheckpointRecord,
  ): void {
    this.record('task-start', node)
    let restored: NodeExecutionResult | Promise<NodeExecutionResult>
    try {
      restored = this.backend.restoreCheckpointTask!({
        instanceId: this.id,
        graphId: this.plan.graphId,
        node,
        record: cloneValue(record),
        signal: this.scopeController.signal,
      })
    } catch (error) {
      restored = Promise.reject(error)
    }
    const task = awaitAbortable(
      Promise.resolve(restored),
      this.scopeController.signal,
    ).then(
      async (result) => {
        if (this.scopeController.signal.aborted) {
          this.record('task-cancel', node)
          return
        }
        const completed = this.completeNode(
          node,
          result,
          this.createSnapshot(node.domain),
          { steps: 0 },
        )
        if (completed instanceof Promise) await completed
        this.record('task-complete', node)
      },
      (error: unknown) => {
        if (this.scopeController.signal.aborted) {
          this.record('task-cancel', node)
          return
        }
        throw error
      },
    )
    this.trackOwnedTask(task)
  }

  invalidateResource(resource: string): void {
    if (!this.plan.nodes.some((node) =>
      node.reads.some((read) => read.resource === resource)
    )) {
      throw new Error(
        `Resource ${resource} is not declared by graph ${this.plan.graphId}`,
      )
    }
    this.resourceVersions.set(
      resource,
      (this.resourceVersions.get(resource) ?? 0) + 1,
    )
  }

  getOutput(portId: string): unknown {
    const port = this.requirePublicPort(portId, 'output', 'data')
    return cloneValue(this.outputs.get(port.id))
  }

  subscribe(portId: string, subscriber: EventSubscriber): () => void {
    const port = this.requirePublicPort(portId, 'output', 'event')
    let subscribers = this.subscribers.get(port.id)
    if (!subscribers) {
      subscribers = new Set()
      this.subscribers.set(port.id, subscribers)
    }
    subscribers.add(subscriber)
    return () => {
      subscribers?.delete(subscriber)
    }
  }

  activate(): void {
    if (this._status === 'destroyed') {
      throw new Error(`Cannot activate a destroyed graph instance ${this.id}`)
    }
    if (this._status === 'active') return
    this.scopeController = new AbortController()
    this.generation += 1
    this._status = 'active'
    this.runLifecycle('activate', this.plan.nodes)
  }

  deactivate(): void {
    if (this._status === 'destroyed' || this._status === 'inactive') return
    this.cancelScope()
    this.runLifecycle('deactivate', [...this.plan.nodes].reverse())
    this._status = 'inactive'
  }

  stop(): void {
    if (this._status === 'destroyed') return
    this.cancelScope()
    this.runLifecycle('stop', [...this.plan.nodes].reverse())
    this._status = 'stopped'
  }

  destroy(): void {
    if (this._status === 'destroyed') return
    this.cancelScope()
    this.runLifecycle('destroy', [...this.plan.nodes].reverse())
    for (const child of this.childInstances) child.destroy()
    this._status = 'destroyed'
  }

  async idle(): Promise<void> {
    await Promise.all([...this.ownedTasks])
  }

  start(nodeId: string): void | Promise<void> {
    if (this._status === 'destroyed') {
      throw new Error(`Cannot start a destroyed graph instance ${this.id}`)
    }
    if (this._status !== 'active') this.activate()
    const node = this.nodes.get(nodeId)
    if (!node) {
      throw new Error(`Graph ${this.plan.graphId} has no executable node ${nodeId}`)
    }
    this.requireSubgraphPlan(node)
    const snapshot = this.createSnapshot(node.domain)
    const execution = this.executeNode(
      nodeId,
      undefined,
      snapshot,
      { steps: 0 },
    )
    if (!(execution instanceof Promise)) return
    const task = execution.then(() => undefined)
    this.trackOwnedTask(task)
    return task
  }

  private executeNode(
    nodeId: string,
    input: NodeExecutionInput | undefined,
    snapshot: SnapshotState,
    budget: ExecutionBudget,
  ): NodeExecutionResult | Promise<NodeExecutionResult> {
    const node = this.nodes.get(nodeId)
    if (!node) {
      throw new Error(`Graph ${this.plan.graphId} has no executable node ${nodeId}`)
    }
    budget.steps += 1
    if (budget.steps > this.limits.maxStepsPerExecution) {
      throw this.runtimeError(
        node,
        snapshot,
        'runtime.runaway',
        `Graph ${this.plan.graphId} exceeded ${this.limits.maxStepsPerExecution} steps`,
        undefined,
        'runaway',
      )
    }
    const childTasks: Promise<unknown>[] = []
    const request: NodeExecutionRequest = {
      instanceId: this.id,
      graphId: this.plan.graphId,
      node,
      input,
      phase: node.domain,
      tickNumber: snapshot.tickNumber,
      frameNumber: snapshot.frameNumber,
      snapshot,
      signal: this.scopeController.signal,
      getParameter: (portId) => this.readParameter(snapshot, portId),
      readResource: (resource) =>
        this.readResource(node, snapshot, resource),
      readData: (inputCallsiteId) =>
        this.readData(node, inputCallsiteId, snapshot, budget),
      readNodeRef: (reference, exportedName) =>
        this.readNodeRef(reference, exportedName),
      runSubgraph: (invocation) =>
        this.runSubgraph(node, invocation),
      spawnChild: (task) => {
        const child = this.spawnChild(node, task)
        childTasks.push(child)
        return child
      },
    }
    this.record(
      'node-start',
      node,
      undefined,
      input
        ? {
            input: {
              callsiteId: input.callsiteId,
              kind: input.kind,
            },
          }
        : undefined,
    )
    let executionResult:
      | NodeExecutionResult
      | Promise<NodeExecutionResult>
      | CheckpointableAsyncTask
    try {
      executionResult = this.backend.execute(request)
    } catch (error) {
      throw this.runtimeError(
        node,
        snapshot,
        'runtime.node-error',
        `Node ${node.id} execution failed: ${errorMessage(error)}`,
        error,
        'node-error',
      )
    }
    const adapter = isCheckpointableAsyncTask(executionResult)
      ? executionResult.checkpoint
      : undefined
    const result = isCheckpointableAsyncTask(executionResult)
      ? executionResult.task
      : executionResult
    if (result instanceof Promise || childTasks.length > 0) {
      const liveTask = result instanceof Promise
        ? this.registerLiveAsyncTask(node, result, adapter)
        : undefined
      return this.finishAsyncNode(
        node,
        result,
        childTasks,
        snapshot,
        budget,
        request.signal,
        liveTask,
      )
    }
    return this.completeNode(node, result, snapshot, budget)
  }

  private completeNode(
    node: ExecutionPlanNode,
    result: NodeExecutionResult,
    snapshot: SnapshotState,
    budget: ExecutionBudget,
  ): NodeExecutionResult | Promise<NodeExecutionResult> {
    if (this.scopeController.signal.aborted) return {}
    this.applyResult(node, result)
    for (const write of node.writes) {
      this.resourceVersions.set(
        write.resource,
        (this.resourceVersions.get(write.resource) ?? 0) + 1,
      )
    }
    this.record('node-complete', node, undefined, {
      outputs: {
        flow: [...(result.flow ?? [])],
        data: Object.keys(result.data ?? {}).sort(),
        events: Object.keys(result.events ?? {}).sort(),
        publicOutputs: Object.keys(result.publicOutputs ?? {}).sort(),
        publicEvents: Object.keys(result.publicEvents ?? {}).sort(),
      },
    })
    const routed: Array<void | Promise<unknown>> = []
    for (const outputCallsiteId of result.flow ?? []) {
      routed.push(this.followFlow(node, outputCallsiteId, snapshot, budget))
    }
    for (const [outputCallsiteId, value] of Object.entries(
      result.events ?? {},
    )) {
      this.routeEvent(node, outputCallsiteId, value, budget)
    }
    const pending = routed.filter(
      (item): item is Promise<unknown> => item instanceof Promise,
    )
    if (pending.length > 0) {
      return Promise.all(pending).then(() => result)
    }
    return result
  }

  private followFlow(
    node: ExecutionPlanNode,
    outputCallsiteId: string,
    snapshot: SnapshotState,
    budget: ExecutionBudget,
  ): void | Promise<unknown> {
    const connections = this.plan.connections.filter(
      (connection) =>
        connection.from.node === node.id &&
        connection.from.callsite === outputCallsiteId &&
        (connection.operation === 'flow' ||
          connection.operation === 'queue-flow'),
    )
    let pending: Promise<unknown> | undefined
    const follow = (connection: (typeof connections)[number]): void | Promise<unknown> => {
      const target = this.nodes.get(connection.to.node)
      if (!target) {
        throw new Error(
          `Graph ${this.plan.graphId} connection ${connection.id} targets a missing node`,
        )
      }
      if (connection.operation === 'flow') {
        const execution = this.executeNode(
          target.id,
          {
            callsiteId: connection.to.callsite,
            kind: 'flow',
          },
          snapshot,
          budget,
        )
        return execution instanceof Promise ? execution : undefined
      }
      const payload: QueuedInvocation = {
        instanceId: this.id,
        nodeId: target.id,
        inputCallsiteId: connection.to.callsite,
        generation: this.generation,
        kind: 'flow',
        budget,
      }
      this.record('queue', target, connection.id)
      this.scheduler.enqueue(
        target.domain,
        payload,
        (command: SchedulerCommand<QueuedInvocation>) => {
          if (
            command.payload.generation !== this.generation ||
            this._status !== 'active'
          ) {
            return
          }
          const queuedSnapshot = this.createSnapshot(target.domain)
          const execution = this.executeNode(
            command.payload.nodeId,
            {
              callsiteId: command.payload.inputCallsiteId,
              kind: command.payload.kind,
              value: command.payload.value,
            },
            queuedSnapshot,
            command.payload.budget,
          )
          if (execution instanceof Promise) {
            this.trackOwnedTask(execution)
          }
        },
      )
      return undefined
    }
    for (const connection of connections) {
      if (pending) {
        pending = pending.then(() => follow(connection))
      } else {
        const result = follow(connection)
        if (result instanceof Promise) pending = result
      }
    }
    return pending
  }

  private routeEvent(
    node: ExecutionPlanNode,
    outputCallsiteId: string,
    value: unknown,
    budget: ExecutionBudget,
  ): void {
    const connections = this.plan.connections.filter(
      (connection) =>
        connection.from.node === node.id &&
        connection.from.callsite === outputCallsiteId &&
        connection.operation === 'queue-event',
    )
    for (const connection of connections) {
      const target = this.nodes.get(connection.to.node)
      if (!target) {
        throw new Error(
          `Graph ${this.plan.graphId} connection ${connection.id} targets a missing node`,
        )
      }
      const payload: QueuedInvocation = {
        instanceId: this.id,
        nodeId: target.id,
        inputCallsiteId: connection.to.callsite,
        generation: this.generation,
        kind: 'event',
        value: cloneValue(value),
        budget,
      }
      this.record('queue', target, connection.id)
      this.scheduler.enqueue(
        target.domain,
        payload,
        (command: SchedulerCommand<QueuedInvocation>) => {
          if (
            command.payload.generation !== this.generation ||
            this._status !== 'active'
          ) {
            return
          }
          const queuedSnapshot = this.createSnapshot(target.domain)
          const execution = this.executeNode(
            command.payload.nodeId,
            {
              callsiteId: command.payload.inputCallsiteId,
              kind: 'event',
              value: cloneValue(command.payload.value),
            },
            queuedSnapshot,
            command.payload.budget,
          )
          if (execution instanceof Promise) {
            this.trackOwnedTask(execution)
          }
        },
      )
    }
  }

  private async finishAsyncNode(
    node: ExecutionPlanNode,
    result: NodeExecutionResult | Promise<NodeExecutionResult>,
    childTasks: readonly Promise<unknown>[],
    snapshot: SnapshotState,
    budget: ExecutionBudget,
    signal: AbortSignal,
    liveTask?: LiveAsyncTask,
  ): Promise<NodeExecutionResult> {
    this.record('task-start', node)
    try {
      const resolved = await awaitAbortable(
        Promise.resolve(result),
        signal,
      )
      await awaitAbortable(
        Promise.all(childTasks),
        signal,
      )
      if (liveTask?.cancelled) return {}
      if (signal.aborted) {
        if (liveTask) this.recordTaskCancellation(liveTask)
        else this.record('task-cancel', node)
        return {}
      }
      for (const callsiteId of liveTask?.callsiteIds ?? []) {
        this.materializedResults.set(callsiteId, cloneValue(resolved))
      }
      const completed = this.completeNode(node, resolved, snapshot, budget)
      const finalResult =
        completed instanceof Promise ? await completed : completed
      this.record('task-complete', node)
      return finalResult
    } catch (error) {
      if (signal.aborted) {
        if (liveTask) this.recordTaskCancellation(liveTask)
        else this.record('task-cancel', node)
        return {}
      }
      if (error instanceof GraphRuntimeError) throw error
      throw this.runtimeError(
        node,
        snapshot,
        'runtime.node-error',
        `Node ${node.id} async execution failed: ${errorMessage(error)}`,
        error,
        'node-error',
      )
    } finally {
      if (liveTask) this.liveAsyncTasks.delete(liveTask)
    }
  }

  private registerLiveAsyncTask(
    node: ExecutionPlanNode,
    promise: Promise<NodeExecutionResult>,
    adapter?: CheckpointableTaskAdapter,
  ): LiveAsyncTask {
    const callsites = [...new Set(
      (this.plan.checkpoints ?? []).flatMap((checkpoint) =>
        (checkpoint.asyncPolicies ?? [])
          .filter((metadata) => metadata.nodeId === node.id)
          .map((metadata) => metadata.callsiteId)
      ),
    )].sort()
    const task: LiveAsyncTask = {
      node,
      callsiteIds: callsites,
      promise,
      adapter,
      cancelled: false,
      cancelRecorded: false,
    }
    this.liveAsyncTasks.add(task)
    return task
  }

  private recordTaskCancellation(task: LiveAsyncTask): void {
    if (task.cancelRecorded) return
    task.cancelRecorded = true
    this.record('task-cancel', task.node)
  }

  private spawnChild<T>(
    node: ExecutionPlanNode,
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const signal = this.scopeController.signal
    this.record('task-start', node)
    let result: Promise<T>
    try {
      result = Promise.resolve(task(signal))
    } catch (error) {
      result = Promise.reject(error)
    }
    return awaitAbortable(result, signal).then(
      (value) => {
        this.record('task-complete', node)
        return value
      },
      (error: unknown) => {
        if (signal.aborted) {
          this.record('task-cancel', node)
          return undefined as T
        }
        throw error
      },
    )
  }

  private trackOwnedTask(task: Promise<unknown>): void {
    this.ownedTasks.add(task)
    void task.then(
      () => this.ownedTasks.delete(task),
      () => this.ownedTasks.delete(task),
    )
  }

  private cancelScope(): void {
    this.generation += 1
    this.scopeController.abort()
    this.subscribers.clear()
    for (const child of this.childInstances) child.deactivate()
  }

  private runLifecycle(
    action: NodeLifecycleAction,
    nodes: readonly ExecutionPlanNode[],
  ): void {
    for (const node of nodes) {
      this.backend.lifecycle?.({
        action,
        instanceId: this.id,
        graphId: this.plan.graphId,
        node,
        signal: this.scopeController.signal,
      })
    }
  }

  private readParameter(snapshot: SnapshotState, portId: string): unknown {
    const port = this.requirePublicPort(portId, 'input', 'data')
    return cloneValue(snapshot.parameters.get(port.id))
  }

  private readData(
    target: ExecutionPlanNode,
    inputCallsiteId: string,
    snapshot: SnapshotState,
    budget: ExecutionBudget,
  ): unknown {
    const connection = this.plan.connections.find(
      (candidate) =>
        candidate.operation === 'data-dependency' &&
        candidate.to.node === target.id &&
        candidate.to.callsite === inputCallsiteId,
    )
    if (!connection) {
      throw new Error(
        `Data input ${inputCallsiteId} on node ${target.id} has no dependency`,
      )
    }
    const source = this.nodes.get(connection.from.node)
    if (!source) {
      throw new Error(
        `Graph ${this.plan.graphId} data connection ${connection.id} has no source node`,
      )
    }
    const cacheKey = `${source.id}:${snapshot.key}`
    let result = this.dataCache.get(cacheKey)
    if (!result) {
      const execution = this.executeNode(
        source.id,
        undefined,
        snapshot,
        budget,
      )
      if (execution instanceof Promise) {
        throw new Error(
          `Lazy data node ${source.id} must complete synchronously`,
        )
      }
      result = execution
      this.dataCache.set(cacheKey, result)
    }
    return cloneValue(result.data?.[connection.from.callsite])
  }

  private readResource(
    node: ExecutionPlanNode,
    snapshot: SnapshotState,
    resource: string,
  ): unknown {
    if (!node.reads.some((read) => read.resource === resource)) {
      throw new Error(
        `Node ${node.id} did not declare resource read ${resource}`,
      )
    }
    return cloneValue(snapshot.resources.get(resource))
  }

  private readNodeRef(
    reference: NodeReference,
    exportedName: string,
  ): unknown {
    const node = this.nodes.get(reference.node)
    if (!node) {
      throw new Error(
        `NodeRef target is not in graph instance ${this.id}: ${reference.node}`,
      )
    }
    if (!node.exportedState.some((entry) => entry.name === exportedName)) {
      throw new Error(
        `Node ${node.id} does not export state ${exportedName}`,
      )
    }
    return cloneValue(this.exportedState.get(node.id)?.get(exportedName))
  }

  private applyResult(
    node: ExecutionPlanNode,
    result: NodeExecutionResult,
  ): void {
    for (const effect of [...(result.effects ?? [])]
      .map((record) => ({ ...cloneValue(record), nodeId: node.id }))
      .sort((left, right) => left.id.localeCompare(right.id))) {
      if (!effect.id) throw new Error(`Node ${node.id} emitted an effect without an ID`)
      this.effectJournal.set(effect.id, effect)
      if (!this.deliveredEffectIds.has(effect.id)) {
        this.deliveredEffectIds.add(effect.id)
        this.effectReconciler?.apply(effect)
      }
    }
    if (result.exportedState) {
      const declared = new Set(node.exportedState.map((entry) => entry.name))
      const state = new Map<string, unknown>()
      for (const [name, value] of Object.entries(result.exportedState)) {
        if (!declared.has(name)) {
          throw new Error(`Node ${node.id} does not declare exported state ${name}`)
        }
        state.set(name, cloneValue(value))
      }
      this.exportedState.set(node.id, state)
    }
    for (const [portId, value] of Object.entries(result.publicOutputs ?? {})) {
      const port = this.requirePublicPort(portId, 'output', 'data')
      this.outputs.set(port.id, cloneValue(value))
    }
    for (const [portId, value] of Object.entries(result.publicEvents ?? {})) {
      const port = this.requirePublicPort(portId, 'output', 'event')
      for (const subscriber of this.subscribers.get(port.id) ?? []) {
        subscriber(cloneValue(value))
      }
    }
  }

  private runSubgraph(
    node: ExecutionPlanNode,
    invocation: SubgraphInvocation,
  ): SubgraphExecutionResult | Promise<SubgraphExecutionResult> {
    const descriptor = this.plan.subgraphs.find(
      (subgraph) => subgraph.nodeId === node.id,
    )
    if (!descriptor) {
      throw new Error(`Node ${node.id} is not a compiled subgraph call`)
    }
    const plan = this.subgraphPlans.get(descriptor.assetId)
    if (!plan) {
      throw new Error(`Missing compiled subgraph plan ${descriptor.assetId}`)
    }
    if (plan.graphId !== descriptor.graphId) {
      throw new Error(
        `Compiled subgraph ${descriptor.assetId} expected graph ${descriptor.graphId}, received ${plan.graphId}`,
      )
    }
    const child = new GraphInstance({
      id: `${this.id}:${node.id}:${this.nextSubgraphSequence++}`,
      plan,
      registryFingerprint: this.plan.registryFingerprint,
      scheduler: this.scheduler,
      backend: this.backend,
      subgraphPlans: this.subgraphPlans,
      resources: this.resources,
      limits: this.limits,
    })
    this.childInstances.push(child)
    for (const [portId, value] of Object.entries(
      invocation.parameters ?? {},
    )) {
      child.setParameter(portId, value)
    }
    const collect = (): SubgraphExecutionResult => {
      const outputs = Object.fromEntries(
        plan.publicInterface.ports
          .filter(
            (port) => port.direction === 'output' && port.kind === 'data',
          )
          .map((port) => [port.id, child.getOutput(port.id)]),
      )
      return {
        instanceId: child.id,
        outputs,
      }
    }
    const execution = child.start(invocation.entryNodeId)
    return execution instanceof Promise
      ? execution.then(collect)
      : collect()
  }

  private requireSubgraphPlan(node: ExecutionPlanNode): void {
    if (node.kind !== 'subgraph') return
    const descriptor = this.plan.subgraphs.find(
      (subgraph) => subgraph.nodeId === node.id,
    )
    if (!descriptor || !this.subgraphPlans.has(descriptor.assetId)) {
      throw new Error(
        `Missing compiled subgraph plan ${descriptor?.assetId ?? node.id}`,
      )
    }
  }

  private requirePublicPort(
    portId: string,
    direction: GraphPublicPort['direction'],
    kind: GraphPublicPort['kind'],
  ): GraphPublicPort {
    const port = this.publicPorts.get(portId)
    if (!port || port.direction !== direction || port.kind !== kind) {
      throw new Error(
        `Unknown public ${direction} ${kind} port ${portId} on graph ${this.plan.graphId}`,
      )
    }
    return port
  }

  private createSnapshot(phase: SchedulerPhase): SnapshotState {
    const id = this.nextSnapshotId++
    const resourceNames = [
      ...new Set(
        this.plan.nodes.flatMap((node) =>
          node.reads.map((read) => read.resource)
        ),
      ),
    ].sort()
    const resourceVersions = Object.fromEntries(
      resourceNames.map((resource) => [
        resource,
        this.resourceVersions.get(resource) ?? 0,
      ]),
    )
    return {
      id,
      key: `${this.scheduler.frameNumber}:${this.scheduler.tickNumber}:${phase}:${this.parameterRevision}:${JSON.stringify(resourceVersions)}`,
      phase,
      tickNumber: this.scheduler.tickNumber,
      frameNumber: this.scheduler.frameNumber,
      resourceVersions,
      parameters: new Map(
        [...this.parameters].map(([portId, value]) => [
          portId,
          cloneValue(value),
        ]),
      ),
      resources: new Map(
        resourceNames.map((resource) => [
          resource,
          cloneValue(this.resources?.snapshot(resource)),
        ]),
      ),
    }
  }

  private runtimeError(
    node: ExecutionPlanNode,
    snapshot: ExecutionSnapshot,
    code: string,
    message: string,
    cause: unknown,
    traceKind: 'node-error' | 'runaway',
  ): GraphRuntimeError {
    this.record(traceKind, node)
    return new GraphRuntimeError({
      code,
      message,
      graphId: this.plan.graphId,
      instanceId: this.id,
      nodeId: node.id,
      phase: node.domain,
      tickNumber: snapshot.tickNumber,
      frameNumber: snapshot.frameNumber,
      cause,
    })
  }

  private record(
    kind: ExecutionTraceKind,
    node: ExecutionPlanNode,
    connectionId?: string,
    details?: Pick<ExecutionTraceEntry, 'input' | 'outputs'>,
  ): void {
    const entry: ExecutionTraceEntry = {
      kind,
      sequence: this.nextTraceSequence++,
      instanceId: this.id,
      graphId: this.plan.graphId,
      nodeId: node.id,
      phase: node.domain,
      tickNumber: this.scheduler.tickNumber,
      frameNumber: this.scheduler.frameNumber,
      connectionId,
      effects: node.effects,
      ...details,
    }
    if (this.traceEntries.length < this.limits.maxTraceEntries) {
      this.traceEntries.push(entry)
      return
    }
    this.traceEntries[this.traceWriteIndex] = entry
    this.traceWriteIndex = (this.traceWriteIndex + 1) % this.traceEntries.length
  }
}

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function cloneMap<K, V>(source: ReadonlyMap<K, V>): Map<K, V> {
  return new Map([...source].map(([key, value]) => [key, cloneValue(value)]))
}

function mapEntries<V>(
  source: ReadonlyMap<string, V>,
): readonly (readonly [string, V])[] {
  return [...source]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, cloneValue(value)] as const)
}

function replaceMap<K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>): void {
  target.clear()
  for (const [key, value] of source) target.set(key, cloneValue(value))
}

export function checksumCheckpointRecord(
  record:
    | PersistentCheckpointRecord
    | Omit<PersistentCheckpointRecord, 'checksum'>,
): string {
  const { checksum: _checksum, ...payload } =
    record as PersistentCheckpointRecord
  return stableFingerprint(payload)
}

function normalizeCheckpointReferences(
  references: readonly CheckpointReference[],
): readonly CheckpointReference[] {
  const normalized = references
    .map((reference) => cloneValue(reference))
    .sort((left, right) => left.id.localeCompare(right.id))
  for (let index = 0; index < normalized.length; index += 1) {
    const reference = normalized[index]
    if (!reference.id || !reference.fingerprint) {
      throw new Error('Checkpoint references require an ID and fingerprint')
    }
    if (index > 0 && normalized[index - 1].id === reference.id) {
      throw new Error(`Duplicate checkpoint reference ${reference.id}`)
    }
  }
  return normalized
}

function sameCheckpointReferences(
  left: readonly CheckpointReference[],
  right: readonly CheckpointReference[],
): boolean {
  const normalizedLeft = normalizeCheckpointReferences(left)
  const normalizedRight = normalizeCheckpointReferences(right)
  return stableFingerprint(normalizedLeft) === stableFingerprint(normalizedRight)
}

function validatePersistentSnapshot(record: PersistentCheckpointRecord): void {
  try {
    cloneValue(record.snapshot)
  } catch (error) {
    throw new Error(
      `Checkpoint ${record.id} contains a non-snapshot-safe value: ${errorMessage(error)}`,
    )
  }
}

function checkpointMigrationKey(
  graphId: string,
  fromPlanFingerprint: string,
  toPlanFingerprint: string,
): string {
  return `${graphId}:${fromPlanFingerprint}->${toPlanFingerprint}`
}

function isQueuedInvocation(value: unknown): value is QueuedInvocation {
  return typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<QueuedInvocation>).instanceId === 'string' &&
    typeof (value as Partial<QueuedInvocation>).nodeId === 'string'
}

function isCheckpointableAsyncTask(
  value:
    | NodeExecutionResult
    | Promise<NodeExecutionResult>
    | CheckpointableAsyncTask,
): value is CheckpointableAsyncTask {
  return typeof value === 'object' &&
    value !== null &&
    'task' in value &&
    (value as Partial<CheckpointableAsyncTask>).task instanceof Promise &&
    typeof (value as Partial<CheckpointableAsyncTask>).checkpoint === 'object'
}

async function waitForCheckpointTask(
  task: Promise<unknown>,
  timeoutMs: number | undefined,
  callsiteId: string,
): Promise<void> {
  if (timeoutMs === undefined) {
    await task
    return
  }
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new CheckpointPolicyError(
            'checkpoint.wait-timeout',
            `Checkpoint timed out waiting for async callsite ${callsiteId}`,
            callsiteId,
          ))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function effectNodeId(record: CheckpointEffectRecord): string | undefined {
  return (record as CheckpointEffectRecord & { readonly nodeId?: string }).nodeId
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function awaitAbortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new Error('Graph execution cancelled'))
  }
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      reject(new Error('Graph execution cancelled'))
    }
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}
