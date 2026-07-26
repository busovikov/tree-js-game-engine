import {
  type EngineScheduler,
  type SchedulerCommand,
  type SchedulerPhase,
} from '@haku/core'
import {
  type ExecutionPlanNode,
  type GraphExecutionPlan,
} from '@haku/graph'

export interface NodeExecutionRequest {
  readonly instanceId: string
  readonly graphId: string
  readonly node: ExecutionPlanNode
  readonly inputCallsiteId?: string
  readonly phase: SchedulerPhase
  readonly tickNumber: number
  readonly frameNumber: number
  readonly signal: AbortSignal
}

export interface NodeExecutionResult {
  readonly flow?: readonly string[]
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
}

interface QueuedFlow {
  readonly nodeId: string
  readonly inputCallsiteId: string
}

export class GraphInstance {
  readonly id: string
  readonly plan: GraphExecutionPlan

  private readonly scheduler: EngineScheduler
  private readonly backend: ExecutionBackend
  private readonly nodes: ReadonlyMap<string, ExecutionPlanNode>
  private readonly abortController = new AbortController()
  private readonly traceEntries: ExecutionTraceEntry[] = []
  private nextTraceSequence = 0

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
    this.nodes = new Map(options.plan.nodes.map((node) => [node.id, node]))
  }

  get trace(): readonly ExecutionTraceEntry[] {
    return this.traceEntries
  }

  start(nodeId: string): void {
    this.executeNode(nodeId)
  }

  private executeNode(nodeId: string, inputCallsiteId?: string): void {
    const node = this.nodes.get(nodeId)
    if (!node) {
      throw new Error(`Graph ${this.plan.graphId} has no executable node ${nodeId}`)
    }
    const request: NodeExecutionRequest = {
      instanceId: this.id,
      graphId: this.plan.graphId,
      node,
      inputCallsiteId,
      phase: node.domain,
      tickNumber: this.scheduler.tickNumber,
      frameNumber: this.scheduler.frameNumber,
      signal: this.abortController.signal,
    }
    this.record('node-start', node)
    const result = this.backend.execute(request)
    if (result instanceof Promise) {
      throw new Error('Async graph nodes require an execution scope')
    }
    this.record('node-complete', node)
    for (const outputCallsiteId of result.flow ?? []) {
      this.followFlow(node, outputCallsiteId)
    }
  }

  private followFlow(node: ExecutionPlanNode, outputCallsiteId: string): void {
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
        this.executeNode(target.id, connection.to.callsite)
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
          this.executeNode(
            command.payload.nodeId,
            command.payload.inputCallsiteId,
          )
        },
      )
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
