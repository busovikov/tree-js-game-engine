import type { SchedulerPhase } from '@haku/core'
import type { ExecutionPlanNode } from '@haku/graph'

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
  spawnChild<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>
}

export interface CheckpointEffectRecord {
  readonly id: string
  readonly kind: string
  readonly payload?: unknown
}

export interface ResourceSnapshotProvider {
  snapshot(resource: string): unknown
  restore?(resource: string, value: unknown): void
  recompute?(resources: readonly string[]): void
}

export interface NodeExecutionResult {
  readonly flow?: readonly string[]
  readonly data?: Readonly<Record<string, unknown>>
  readonly events?: Readonly<Record<string, unknown>>
  readonly publicOutputs?: Readonly<Record<string, unknown>>
  readonly publicEvents?: Readonly<Record<string, unknown>>
  readonly exportedState?: Readonly<Record<string, unknown>>
  readonly effects?: readonly CheckpointEffectRecord[]
}

export type CancelFallbackKind = 'option' | 'result'

export interface RestartCheckpointAdapter {
  readonly safety: 'pure' | 'idempotent'
  readonly inputs: () => unknown
}

export interface ResumeCheckpointAdapter {
  readonly stateMachineId: string
  readonly serialize: () => unknown
}

export interface ReconnectCheckpointAdapter {
  readonly operationId: string
  readonly status: () => unknown
}

export interface CheckpointableTaskAdapter {
  readonly restart?: RestartCheckpointAdapter
  readonly resume?: ResumeCheckpointAdapter
  readonly reconnect?: ReconnectCheckpointAdapter
  readonly cancel?: () => void
  readonly fallback?: {
    readonly kind: CancelFallbackKind
    readonly result: NodeExecutionResult
  }
}

export interface CheckpointableAsyncTask {
  readonly task: Promise<NodeExecutionResult>
  readonly checkpoint: CheckpointableTaskAdapter
}

export function checkpointableTask(
  task: Promise<NodeExecutionResult>,
  checkpoint: CheckpointableTaskAdapter,
): CheckpointableAsyncTask {
  return { task, checkpoint }
}

export interface NodeRuntimeAdapter {
  readonly nodeType: string
  readonly version: string
  execute(
    request: NodeExecutionRequest,
  ): NodeExecutionResult | Promise<NodeExecutionResult> | CheckpointableAsyncTask
  lifecycle?(request: NodeLifecycleRequest): void
}

export type NodeLifecycleAction =
  | 'create'
  | 'activate'
  | 'deactivate'
  | 'stop'
  | 'destroy'
  | 'before-rewind'
  | 'after-rewind'
  | 'resume-from-checkpoint'

export interface NodeLifecycleRequest {
  readonly action: NodeLifecycleAction
  readonly instanceId: string
  readonly graphId: string
  readonly node: ExecutionPlanNode
  readonly signal: AbortSignal
}

export class NodeRuntimeRegistry {
  private readonly adapters = new Map<string, NodeRuntimeAdapter>()

  register(adapter: NodeRuntimeAdapter): void {
    const key = runtimeAdapterKey(adapter.nodeType, adapter.version)
    if (this.adapters.has(key)) {
      throw new Error(
        `Duplicate runtime adapter ${adapter.nodeType}@${adapter.version}`,
      )
    }
    this.adapters.set(key, adapter)
  }

  require(nodeType: string, version: string): NodeRuntimeAdapter {
    const adapter = this.adapters.get(runtimeAdapterKey(nodeType, version))
    if (!adapter) {
      throw new Error(`Missing runtime adapter ${nodeType}@${version}`)
    }
    return adapter
  }
}

function runtimeAdapterKey(nodeType: string, version: string): string {
  return `${nodeType}@${version}`
}
