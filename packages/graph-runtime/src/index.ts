import {
  type EngineScheduler,
  type SchedulerCommand,
  type SchedulerPhase,
} from '@haku/core'
import {
  type ExecutionPlanNode,
  type GraphExecutionPlan,
  type GraphPublicPort,
} from '@haku/graph'

export interface NodeReference {
  readonly node: string
}

export interface NodeExecutionInput {
  readonly callsiteId: string
  readonly kind: 'flow' | 'event'
  readonly value?: unknown
}

export interface ExecutionSnapshot {
  readonly id: number
  readonly key: string
  readonly phase: SchedulerPhase
  readonly tickNumber: number
  readonly frameNumber: number
  readonly resourceVersions: Readonly<Record<string, number>>
}

export interface SubgraphInvocation {
  readonly entryNodeId: string
  readonly parameters?: Readonly<Record<string, unknown>>
}

export interface SubgraphExecutionResult {
  readonly instanceId: string
  readonly outputs: Readonly<Record<string, unknown>>
}

export interface NodeExecutionRequest {
  readonly instanceId: string
  readonly graphId: string
  readonly node: ExecutionPlanNode
  readonly input?: NodeExecutionInput
  readonly phase: SchedulerPhase
  readonly tickNumber: number
  readonly frameNumber: number
  readonly snapshot: ExecutionSnapshot
  readonly signal: AbortSignal
  getParameter(portId: string): unknown
  readResource(resource: string): unknown
  readData(inputCallsiteId: string): unknown
  readNodeRef(reference: NodeReference, exportedName: string): unknown
  runSubgraph(
    invocation: SubgraphInvocation,
  ): SubgraphExecutionResult | Promise<SubgraphExecutionResult>
  spawnChild<T>(
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<T>
}

export interface NodeExecutionResult {
  readonly flow?: readonly string[]
  readonly data?: Readonly<Record<string, unknown>>
  readonly events?: Readonly<Record<string, unknown>>
  readonly publicOutputs?: Readonly<Record<string, unknown>>
  readonly publicEvents?: Readonly<Record<string, unknown>>
  readonly exportedState?: Readonly<Record<string, unknown>>
}

export interface ExecutionBackend {
  execute(
    request: NodeExecutionRequest,
  ): NodeExecutionResult | Promise<NodeExecutionResult>
  lifecycle?(request: NodeLifecycleRequest): void
}

export type NodeLifecycleAction =
  | 'create'
  | 'activate'
  | 'deactivate'
  | 'stop'
  | 'destroy'

export interface NodeLifecycleRequest {
  readonly action: NodeLifecycleAction
  readonly instanceId: string
  readonly graphId: string
  readonly node: ExecutionPlanNode
  readonly signal: AbortSignal
}

export type ExecutionTraceKind =
  | 'node-start'
  | 'node-complete'
  | 'queue'
  | 'task-start'
  | 'task-complete'
  | 'task-cancel'

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
}

export interface GraphInstanceOptions {
  readonly id: string
  readonly plan: GraphExecutionPlan
  readonly registryFingerprint: string
  readonly scheduler: EngineScheduler
  readonly backend: ExecutionBackend
  readonly subgraphPlans?: ReadonlyMap<string, GraphExecutionPlan>
  readonly resources?: ResourceSnapshotProvider
}

export interface ResourceSnapshotProvider {
  snapshot(resource: string): unknown
}

export type GraphInstanceStatus =
  | 'inactive'
  | 'active'
  | 'stopped'
  | 'destroyed'

interface QueuedFlow {
  readonly nodeId: string
  readonly inputCallsiteId: string
  readonly generation: number
}

interface SnapshotState extends ExecutionSnapshot {
  readonly parameters: ReadonlyMap<string, unknown>
  readonly resources: ReadonlyMap<string, unknown>
}

interface ExecutionBudget {
  steps: number
}

type EventSubscriber = (value: unknown) => void

export class GraphInstance {
  readonly id: string
  readonly plan: GraphExecutionPlan

  private readonly scheduler: EngineScheduler
  private readonly backend: ExecutionBackend
  private readonly nodes: ReadonlyMap<string, ExecutionPlanNode>
  private readonly publicPorts: ReadonlyMap<string, GraphPublicPort>
  private readonly subgraphPlans: ReadonlyMap<string, GraphExecutionPlan>
  private readonly resources?: ResourceSnapshotProvider
  private scopeController = new AbortController()
  private readonly traceEntries: ExecutionTraceEntry[] = []
  private readonly parameters = new Map<string, unknown>()
  private readonly outputs = new Map<string, unknown>()
  private readonly exportedState = new Map<string, ReadonlyMap<string, unknown>>()
  private readonly subscribers = new Map<string, Set<EventSubscriber>>()
  private readonly dataCache = new Map<string, NodeExecutionResult>()
  private readonly resourceVersions = new Map<string, number>()
  private readonly childInstances: GraphInstance[] = []
  private readonly ownedTasks = new Set<Promise<unknown>>()
  private nextTraceSequence = 0
  private nextSnapshotId = 0
  private parameterRevision = 0
  private nextSubgraphSequence = 0
  private generation = 0
  private _status: GraphInstanceStatus = 'inactive'

  constructor(options: GraphInstanceOptions) {
    if (options.plan.registryFingerprint !== options.registryFingerprint) {
      throw new Error(
        `Graph plan ${options.plan.graphId} is incompatible with the runtime registry`,
      )
    }
    this.id = options.id
    this.plan = options.plan
    this.scheduler = options.scheduler
    this.backend = options.backend
    this.subgraphPlans = options.subgraphPlans ?? new Map()
    this.resources = options.resources
    this.nodes = new Map(options.plan.nodes.map((node) => [node.id, node]))
    this.publicPorts = new Map(
      options.plan.publicInterface.ports.map((port) => [port.id, port]),
    )
    this.runLifecycle('create', options.plan.nodes)
  }

  get trace(): readonly ExecutionTraceEntry[] {
    return this.traceEntries
  }

  get status(): GraphInstanceStatus {
    return this._status
  }

  setParameter(portId: string, value: unknown): void {
    const port = this.requirePublicPort(portId, 'input', 'data')
    this.parameters.set(port.id, cloneValue(value))
    this.parameterRevision += 1
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
    this.record('node-start', node)
    const result = this.backend.execute(request)
    if (result instanceof Promise || childTasks.length > 0) {
      return this.finishAsyncNode(
        node,
        result,
        childTasks,
        snapshot,
        budget,
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
    this.record('node-complete', node)
    const routed: Array<void | Promise<unknown>> = []
    for (const outputCallsiteId of result.flow ?? []) {
      routed.push(this.followFlow(node, outputCallsiteId, snapshot, budget))
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
      const payload: QueuedFlow = {
        nodeId: target.id,
        inputCallsiteId: connection.to.callsite,
        generation: this.generation,
      }
      this.record('queue', target, connection.id)
      this.scheduler.enqueue(
        target.domain,
        payload,
        (command: SchedulerCommand<QueuedFlow>) => {
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
              kind: 'flow',
            },
            queuedSnapshot,
            { steps: 0 },
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

  private async finishAsyncNode(
    node: ExecutionPlanNode,
    result: NodeExecutionResult | Promise<NodeExecutionResult>,
    childTasks: readonly Promise<unknown>[],
    snapshot: SnapshotState,
    budget: ExecutionBudget,
  ): Promise<NodeExecutionResult> {
    this.record('task-start', node)
    try {
      const resolved = await awaitAbortable(
        Promise.resolve(result),
        this.scopeController.signal,
      )
      await awaitAbortable(
        Promise.all(childTasks),
        this.scopeController.signal,
      )
      if (this.scopeController.signal.aborted) {
        this.record('task-cancel', node)
        return {}
      }
      const completed = this.completeNode(node, resolved, snapshot, budget)
      const finalResult =
        completed instanceof Promise ? await completed : completed
      this.record('task-complete', node)
      return finalResult
    } catch (error) {
      if (this.scopeController.signal.aborted) {
        this.record('task-cancel', node)
        return {}
      }
      throw error
    }
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

  private record(
    kind: ExecutionTraceKind,
    node: ExecutionPlanNode,
    connectionId?: string,
  ): void {
    this.traceEntries.push({
      kind,
      sequence: this.nextTraceSequence++,
      instanceId: this.id,
      graphId: this.plan.graphId,
      nodeId: node.id,
      phase: node.domain,
      tickNumber: this.scheduler.tickNumber,
      frameNumber: this.scheduler.frameNumber,
      connectionId,
    })
  }
}

function cloneValue<T>(value: T): T {
  return structuredClone(value)
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
