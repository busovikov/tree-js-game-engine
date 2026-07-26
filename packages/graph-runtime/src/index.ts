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
}

export type ExecutionTraceKind =
  | 'node-start'
  | 'node-complete'
  | 'queue'

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

interface QueuedFlow {
  readonly nodeId: string
  readonly inputCallsiteId: string
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
  private readonly abortController = new AbortController()
  private readonly traceEntries: ExecutionTraceEntry[] = []
  private readonly parameters = new Map<string, unknown>()
  private readonly outputs = new Map<string, unknown>()
  private readonly exportedState = new Map<string, ReadonlyMap<string, unknown>>()
  private readonly subscribers = new Map<string, Set<EventSubscriber>>()
  private readonly dataCache = new Map<string, NodeExecutionResult>()
  private readonly resourceVersions = new Map<string, number>()
  private readonly childInstances: GraphInstance[] = []
  private nextTraceSequence = 0
  private nextSnapshotId = 0
  private parameterRevision = 0
  private nextSubgraphSequence = 0

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
  }

  get trace(): readonly ExecutionTraceEntry[] {
    return this.traceEntries
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

  start(nodeId: string): void {
    const node = this.nodes.get(nodeId)
    if (!node) {
      throw new Error(`Graph ${this.plan.graphId} has no executable node ${nodeId}`)
    }
    this.requireSubgraphPlan(node)
    const snapshot = this.createSnapshot(node.domain)
    this.executeNode(nodeId, undefined, snapshot, { steps: 0 })
  }

  private executeNode(
    nodeId: string,
    input: NodeExecutionInput | undefined,
    snapshot: SnapshotState,
    budget: ExecutionBudget,
  ): NodeExecutionResult {
    const node = this.nodes.get(nodeId)
    if (!node) {
      throw new Error(`Graph ${this.plan.graphId} has no executable node ${nodeId}`)
    }
    const request: NodeExecutionRequest = {
      instanceId: this.id,
      graphId: this.plan.graphId,
      node,
      input,
      phase: node.domain,
      tickNumber: snapshot.tickNumber,
      frameNumber: snapshot.frameNumber,
      snapshot,
      signal: this.abortController.signal,
      getParameter: (portId) => this.readParameter(snapshot, portId),
      readResource: (resource) =>
        this.readResource(node, snapshot, resource),
      readData: (inputCallsiteId) =>
        this.readData(node, inputCallsiteId, snapshot, budget),
      readNodeRef: (reference, exportedName) =>
        this.readNodeRef(reference, exportedName),
      runSubgraph: (invocation) =>
        this.runSubgraph(node, invocation),
    }
    this.record('node-start', node)
    const result = this.backend.execute(request)
    if (result instanceof Promise) {
      throw new Error('Async graph nodes require an execution scope')
    }
    this.applyResult(node, result)
    this.record('node-complete', node)
    for (const outputCallsiteId of result.flow ?? []) {
      this.followFlow(node, outputCallsiteId, snapshot, budget)
    }
    return result
  }

  private followFlow(
    node: ExecutionPlanNode,
    outputCallsiteId: string,
    snapshot: SnapshotState,
    budget: ExecutionBudget,
  ): void {
    const connections = this.plan.connections.filter(
      (connection) =>
        connection.from.node === node.id &&
        connection.from.callsite === outputCallsiteId &&
        (connection.operation === 'flow' ||
          connection.operation === 'queue-flow'),
    )
    for (const connection of connections) {
      const target = this.nodes.get(connection.to.node)
      if (!target) {
        throw new Error(
          `Graph ${this.plan.graphId} connection ${connection.id} targets a missing node`,
        )
      }
      if (connection.operation === 'flow') {
        this.executeNode(
          target.id,
          {
            callsiteId: connection.to.callsite,
            kind: 'flow',
          },
          snapshot,
          budget,
        )
        continue
      }
      const payload: QueuedFlow = {
        nodeId: target.id,
        inputCallsiteId: connection.to.callsite,
      }
      this.record('queue', target, connection.id)
      this.scheduler.enqueue(
        target.domain,
        payload,
        (command: SchedulerCommand<QueuedFlow>) => {
          const queuedSnapshot = this.createSnapshot(target.domain)
          this.executeNode(
            command.payload.nodeId,
            {
              callsiteId: command.payload.inputCallsiteId,
              kind: 'flow',
            },
            queuedSnapshot,
            { steps: 0 },
          )
        },
      )
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
      result = this.executeNode(source.id, undefined, snapshot, budget)
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
  ): SubgraphExecutionResult {
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
    child.start(invocation.entryNodeId)
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
