import { z } from 'zod'
import {
  SCHEDULER_PHASES,
  type SchedulerPhase,
} from '@haku/core'
import {
  GraphPortIdSchema,
  JsonValueSchema,
  NodeTypeIdSchema,
  TypeExpressionSchema,
  type JsonValue,
  type TypeExpression,
} from './graph-schema.js'
import {
  GraphDiagnosticError,
  type GraphDiagnostic,
} from './diagnostics.js'
import {
  stableFingerprint,
  type TypeRegistry,
} from './type-registry.js'

export type NodeKind = 'builtin' | 'custom' | 'subgraph'
export type NodeExecutionContract = 'sync' | 'async'
export type NodeCheckpointPolicy = 'safe' | 'conditional' | 'unsafe'
export type NodeCheckpointRole = 'none' | 'create'
export type NodeCheckpointScope = 'bounded' | 'unbounded'
export const ASYNC_CHECKPOINT_POLICIES = [
  'wait',
  'restart',
  'resume',
  'reconnect',
  'materialized',
  'cancel-fallback',
  'reject',
] as const
export type AsyncCheckpointPolicy = (typeof ASYNC_CHECKPOINT_POLICIES)[number]
export type NodeResultPersistence = 'none' | 'execution' | 'checkpoint'
export type NodeLiveness = 'pure' | 'on-flow' | 'on-event' | 'always'
export type ResourceScope = 'static' | 'dynamic' | 'unprovable'

export const NODE_CAPABILITIES = [
  'world.read',
  'world.write',
  'assets',
  'scene',
  'scheduler',
  'events',
  'state',
  'random.seeded',
  'ui',
  'audio',
  'storage',
  'platform',
  'pool',
  'debug',
] as const

export type NodeCapability = (typeof NODE_CAPABILITIES)[number]

export const NODE_EFFECTS = [
  'world.read',
  'world.write',
  'asset.read',
  'scene.load',
  'event.emit',
  'random.seeded',
  'ui',
  'audio',
  'storage.read',
  'storage.write',
  'platform',
  'pool',
  'debug',
  'external',
  'unknown',
] as const

export type NodeEffect = (typeof NODE_EFFECTS)[number]

export interface ResourceAccess {
  readonly resource: string
  readonly scope: ResourceScope
}

export type NodePortDefinition =
  | {
      readonly id: string
      readonly name: string
      readonly kind: 'flow' | 'trigger'
      readonly direction: 'input' | 'output'
    }
  | {
      readonly id: string
      readonly name: string
      readonly kind: 'event' | 'data'
      readonly direction: 'input' | 'output'
      readonly type: TypeExpression
    }

export interface ExportedNodeState {
  readonly name: string
  readonly type: TypeExpression
}

export interface NodeDefinitionContract {
  readonly id: string
  readonly version: string
  readonly name: string
  readonly category: string
  readonly description: string
  readonly kind: NodeKind
  readonly typeParameters: readonly string[]
  readonly ports: readonly NodePortDefinition[]
  readonly propertyContract: JsonValue
  readonly domains: readonly SchedulerPhase[]
  readonly capabilities: readonly NodeCapability[]
  readonly reads: readonly ResourceAccess[]
  readonly writes: readonly ResourceAccess[]
  readonly effects: readonly NodeEffect[]
  readonly execution: NodeExecutionContract
  readonly checkpoint: NodeCheckpointPolicy
  readonly checkpointRole: NodeCheckpointRole
  readonly checkpointScope: NodeCheckpointScope
  readonly asyncCheckpointPolicies: readonly AsyncCheckpointPolicy[]
  readonly resultPersistence: NodeResultPersistence
  readonly liveness: NodeLiveness
  readonly exportedState: readonly ExportedNodeState[]
}

export interface NodeDefinition {
  readonly contract: NodeDefinitionContract
  readonly propertySchema: z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>
}

export interface NodePortInput {
  readonly id: string
  readonly name: string
  readonly kind: 'flow' | 'event' | 'trigger' | 'data'
  readonly direction: 'input' | 'output'
  readonly type?: TypeExpression
}

export interface NodeDefinitionInput
  extends Omit<
    NodeDefinitionContract,
    | 'ports'
    | 'propertyContract'
    | 'checkpointRole'
    | 'checkpointScope'
    | 'asyncCheckpointPolicies'
  > {
  readonly ports: readonly NodePortInput[]
  readonly propertySchema: z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>
  readonly propertyContract: unknown
  readonly checkpointRole?: NodeCheckpointRole
  readonly checkpointScope?: NodeCheckpointScope
  readonly asyncCheckpointPolicies?: readonly AsyncCheckpointPolicy[]
}

function diagnostic(
  code: string,
  message: string,
  location: GraphDiagnostic['location'],
): GraphDiagnostic {
  return {
    code,
    severity: 'error',
    message,
    location,
    causalChain: [],
  }
}

export function defineNode(input: NodeDefinitionInput): NodeDefinition {
  const id = NodeTypeIdSchema.parse(input.id)
  if (!input.name) throw new Error('Node name must not be empty')
  if (!input.version) throw new Error('Node version must not be empty')
  if (!input.category) throw new Error('Node category must not be empty')
  if (!SCHEDULER_PHASES.includes(input.domains[0] ?? 'FrameGameplay')) {
    throw new Error(`Unknown execution domain: ${String(input.domains[0])}`)
  }
  for (const domain of input.domains) {
    if (!SCHEDULER_PHASES.includes(domain)) {
      throw new Error(`Unknown execution domain: ${domain}`)
    }
  }

  const diagnostics: GraphDiagnostic[] = []
  const seenPorts = new Set<string>()
  const ports: NodePortDefinition[] = []
  for (const port of input.ports) {
    const portId = GraphPortIdSchema.parse(port.id)
    if (seenPorts.has(portId)) {
      diagnostics.push(
        diagnostic(
          'registry.duplicate-port',
          `Duplicate port ID ${portId} on node type ${id}`,
          { nodeTypeId: id, portId },
        ),
      )
      continue
    }
    seenPorts.add(portId)
    if (port.kind === 'flow' || port.kind === 'trigger') {
      if (port.type !== undefined) {
        throw new Error(`${port.kind} port must not declare a data type`)
      }
      ports.push({
        id: portId,
        name: port.name,
        kind: port.kind,
        direction: port.direction,
      })
      continue
    }
    if (port.type === undefined) {
      throw new Error(`${port.kind} port requires a data type`)
    }
    ports.push({
      id: portId,
      name: port.name,
      kind: port.kind,
      direction: port.direction,
      type: TypeExpressionSchema.parse(port.type),
    })
  }
  if (diagnostics.length > 0) throw new GraphDiagnosticError(diagnostics)

  const typeParameters = [...input.typeParameters]
  if (new Set(typeParameters).size !== typeParameters.length) {
    throw new Error(`Node ${id} has duplicate type parameters`)
  }
  const propertyContract = JsonValueSchema.parse(input.propertyContract)
  return {
    contract: {
      id,
      version: input.version,
      name: input.name,
      category: input.category,
      description: input.description,
      kind: input.kind,
      typeParameters,
      ports,
      propertyContract,
      domains: [...input.domains].sort(),
      capabilities: [...input.capabilities].sort(),
      reads: [...input.reads].sort((left, right) =>
        `${left.resource}:${left.scope}`.localeCompare(`${right.resource}:${right.scope}`),
      ),
      writes: [...input.writes].sort((left, right) =>
        `${left.resource}:${left.scope}`.localeCompare(`${right.resource}:${right.scope}`),
      ),
      effects: [...input.effects].sort(),
      execution: input.execution,
      checkpoint: input.checkpoint,
      checkpointRole: input.checkpointRole ?? 'none',
      checkpointScope: input.checkpointScope ?? 'bounded',
      asyncCheckpointPolicies: ASYNC_CHECKPOINT_POLICIES.filter((policy) =>
        (input.asyncCheckpointPolicies ??
          (input.execution === 'async' ? ['reject'] : [])
        ).includes(policy)
      ),
      resultPersistence: input.resultPersistence,
      liveness: input.liveness,
      exportedState: [...input.exportedState].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    },
    propertySchema: input.propertySchema,
  }
}

export class NodeRegistry {
  private readonly definitions = new Map<string, NodeDefinition>()

  register(definition: NodeDefinition): void {
    const id = definition.contract.id
    if (this.definitions.has(id)) {
      throw new GraphDiagnosticError([
        diagnostic(
          'registry.duplicate-node-type',
          `Duplicate node type ID: ${id}`,
          { nodeTypeId: id },
        ),
      ])
    }
    this.definitions.set(id, definition)
  }

  get(id: string): NodeDefinition | undefined {
    return this.definitions.get(id)
  }

  require(id: string): NodeDefinition {
    const definition = this.get(id)
    if (!definition) {
      throw new GraphDiagnosticError([
        diagnostic(
          'registry.unknown-node-type',
          `Unknown node type ID: ${id}`,
          { nodeTypeId: id },
        ),
      ])
    }
    return definition
  }

  all(): readonly NodeDefinition[] {
    return [...this.definitions.values()].sort((left, right) =>
      left.contract.id.localeCompare(right.contract.id),
    )
  }

  fingerprint(): string {
    return stableFingerprint(this.all().map((definition) => definition.contract))
  }
}

export interface NodeCheckpointEligibility {
  readonly eligible: boolean
  readonly causalChain: readonly string[]
}

export function analyzeNodeCheckpointEligibility(
  definition: NodeDefinition,
): NodeCheckpointEligibility {
  const causalChain = [`node ${definition.contract.name}`]
  if (definition.contract.checkpoint !== 'safe') {
    causalChain.push(`checkpoint policy ${definition.contract.checkpoint}`)
  }
  for (const effect of definition.contract.effects) {
    if (effect === 'unknown' || effect === 'external') {
      causalChain.push(`effect ${effect}`)
    }
  }
  for (const read of definition.contract.reads) {
    if (read.scope === 'dynamic') {
      causalChain.push(`dynamic ${read.resource} read`)
    } else if (read.scope === 'unprovable') {
      causalChain.push(`unprovable ${read.resource} query`)
    }
  }
  return {
    eligible: causalChain.length === 1,
    causalChain: causalChain.length === 1 ? [] : causalChain,
  }
}

export function createRegistryFingerprint(
  types: TypeRegistry,
  nodes: NodeRegistry,
): string {
  return stableFingerprint({
    types: types.all().map((definition) => definition.contract),
    nodes: nodes.all().map((definition) => definition.contract),
  })
}

export interface WorldReadCapability {
  readonly getComponent: (entityId: string, componentType: string) => unknown
}

export interface WorldWriteCapability extends WorldReadCapability {
  readonly setComponent: (
    entityId: string,
    componentType: string,
    value: unknown,
  ) => void
}

export interface NodeCapabilityApiMap {
  readonly 'world.read': WorldReadCapability
  readonly 'world.write': WorldWriteCapability
  readonly assets: unknown
  readonly scene: unknown
  readonly scheduler: unknown
  readonly events: unknown
  readonly state: unknown
  readonly 'random.seeded': unknown
  readonly ui: unknown
  readonly audio: unknown
  readonly storage: unknown
  readonly platform: unknown
  readonly pool: unknown
  readonly debug: unknown
}

export interface NodeExecutionContext<
  TCapability extends keyof NodeCapabilityApiMap = never,
> {
  readonly domain: SchedulerPhase
  readonly graphInstanceId: string
  readonly nodeId: string
  capability<T extends TCapability>(name: T): NodeCapabilityApiMap[T]
}
