import type { SchedulerPhase } from '@haku/core'
import {
  GraphAssetSchema,
  type GraphAsset,
  type GraphCallsite,
  type GraphConnection,
  type GraphNode,
  type GraphPublicInterface,
  type JsonValue,
  type TypeExpression,
} from './graph-schema.js'
import {
  type GraphDiagnostic,
  type GraphDiagnosticCause,
  type GraphDiagnosticLocation,
} from './diagnostics.js'
import {
  NodeRegistry,
  analyzeNodeCheckpointEligibility,
  createRegistryFingerprint,
  type NodeCapability,
  type NodeDefinition,
} from './node-registry.js'
import {
  TypeRegistry,
  inferTypeArguments,
  resolveTypeExpression,
  stableFingerprint,
} from './type-registry.js'

export type PlanConnectionOperation =
  | 'data-dependency'
  | 'flow'
  | 'queue-flow'
  | 'queue-event'

export interface ExecutionPlanNode {
  readonly id: string
  readonly nodeType: string
  readonly version: string
  readonly kind: NodeDefinition['contract']['kind']
  readonly domain: SchedulerPhase
  readonly order: number
  readonly typeArguments: Readonly<Record<string, TypeExpression>>
  readonly properties: Readonly<Record<string, unknown>>
  readonly reads: NodeDefinition['contract']['reads']
  readonly writes: NodeDefinition['contract']['writes']
  readonly effects: NodeDefinition['contract']['effects']
  readonly execution: NodeDefinition['contract']['execution']
  readonly exportedState: NodeDefinition['contract']['exportedState']
  readonly checkpoint: ReturnType<typeof analyzeNodeCheckpointEligibility>
}

export type CheckpointDependencyKind =
  | 'dynamic-physics'
  | 'unknown-effect'
  | 'unprovable-query'
  | 'unbounded-scope'

export interface CheckpointDependency {
  readonly kind: CheckpointDependencyKind
  readonly nodeId: string
  readonly resource?: string
  readonly effect?: string
  readonly causalChain: readonly string[]
}

export interface CheckpointStateScope {
  readonly nodes: readonly string[]
  readonly resources: readonly string[]
  readonly unbounded: boolean
}

export interface ExecutionPlanCheckpoint {
  readonly nodeId: string
  readonly eligible: boolean
  readonly stateScope: CheckpointStateScope
  readonly dependencies: readonly CheckpointDependency[]
  readonly asyncPolicies: readonly never[]
}

export interface ExecutionPlanConnection {
  readonly id: string
  readonly kind: GraphCallsite['kind']
  readonly operation: PlanConnectionOperation
  readonly from: GraphConnection['from']
  readonly to: GraphConnection['to']
}

export interface ExecutionPlanSubgraph {
  readonly nodeId: string
  readonly assetId: string
  readonly graphId: string
}

export interface GraphExecutionPlan {
  readonly schemaVersion: 1
  readonly graphId: string
  readonly registryFingerprint: string
  readonly planFingerprint: string
  readonly nodes: readonly ExecutionPlanNode[]
  readonly connections: readonly ExecutionPlanConnection[]
  readonly publicInterface: GraphPublicInterface
  readonly subgraphs: readonly ExecutionPlanSubgraph[]
  readonly checkpoints: readonly ExecutionPlanCheckpoint[]
  readonly checkpointEligible: boolean
}

export interface CompileGraphOptions {
  readonly types: TypeRegistry
  readonly nodes: NodeRegistry
  readonly subgraphs?: ReadonlyMap<string, GraphAsset>
}

export interface GraphCompileResult {
  readonly diagnostics: readonly GraphDiagnostic[]
  readonly plan?: GraphExecutionPlan
}

interface NodeAnalysis {
  readonly node: GraphNode
  readonly definition: NodeDefinition
  readonly domain: SchedulerPhase
  readonly callsites: ReadonlyMap<string, GraphCallsite>
  readonly typeArguments: Readonly<Record<string, TypeExpression>>
  readonly properties: Readonly<Record<string, unknown>>
}

const EFFECT_CAPABILITIES: Readonly<Partial<Record<string, NodeCapability>>> = {
  'world.read': 'world.read',
  'world.write': 'world.write',
  'asset.read': 'assets',
  'scene.load': 'scene',
  'event.emit': 'events',
  'random.seeded': 'random.seeded',
  ui: 'ui',
  audio: 'audio',
  'storage.read': 'storage',
  'storage.write': 'storage',
  platform: 'platform',
  pool: 'pool',
  debug: 'debug',
}

function diagnostic(
  code: string,
  message: string,
  location: GraphDiagnosticLocation,
  causalChain: readonly GraphDiagnosticCause[] = [],
  severity: GraphDiagnostic['severity'] = 'error',
): GraphDiagnostic {
  return { code, severity, message, location, causalChain }
}

function callsiteType(callsite: GraphCallsite): TypeExpression | undefined {
  return callsite.kind === 'data' || callsite.kind === 'event'
    ? callsite.type
    : undefined
}

function portType(
  port: NodeDefinition['contract']['ports'][number],
): TypeExpression | undefined {
  return port.kind === 'data' || port.kind === 'event'
    ? port.type
    : undefined
}

function findNodeReferences(value: unknown): string[] {
  const references: string[] = []
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item)
      return
    }
    if (typeof candidate !== 'object' || candidate === null) return
    const record = candidate as Record<string, unknown>
    if (
      typeof record.node === 'string' &&
      Object.keys(record).every((key) => key === 'node')
    ) {
      references.push(record.node)
      return
    }
    for (const item of Object.values(record)) visit(item)
  }
  visit(value)
  return references.sort()
}

function validateNode(
  graphId: string,
  node: GraphNode,
  definition: NodeDefinition,
  types: TypeRegistry,
  allNodeIds: ReadonlySet<string>,
  diagnostics: GraphDiagnostic[],
): NodeAnalysis | undefined {
  const domain = node.domain ?? definition.contract.domains[0]
  if (domain === undefined || !definition.contract.domains.includes(domain)) {
    diagnostics.push(
      diagnostic(
        'node.domain-not-allowed',
        `Node ${node.id} cannot execute in ${String(domain)}`,
        { graphId, nodeId: node.id },
      ),
    )
    return undefined
  }
  if (node.version !== definition.contract.version) {
    diagnostics.push(
      diagnostic(
        'node.version-mismatch',
        `Node ${node.id} uses ${node.version}; registry requires ${definition.contract.version}`,
        { graphId, nodeId: node.id, nodeTypeId: node.type },
      ),
    )
  }

  const parsedProperties = definition.propertySchema.safeParse(node.properties)
  if (!parsedProperties.success) {
    diagnostics.push(
      diagnostic(
        'node.invalid-properties',
        `Node ${node.id} properties do not match ${definition.contract.name}`,
        { graphId, nodeId: node.id, nodeTypeId: node.type },
        parsedProperties.error.issues.map((issue) => ({
          message: `${issue.path.join('.')}: ${issue.message}`,
          location: { graphId, nodeId: node.id },
        })),
      ),
    )
  }

  const ports = new Map(definition.contract.ports.map((port) => [port.id, port]))
  const callsites = new Map<string, GraphCallsite>()
  const calledPorts = new Set<string>()
  let typeArguments: Record<string, TypeExpression> = {}
  for (const callsite of node.callsites) {
    if (callsites.has(callsite.id)) {
      diagnostics.push(
        diagnostic(
          'node.duplicate-callsite',
          `Duplicate callsite ID ${callsite.id} on node ${node.id}`,
          {
            graphId,
            nodeId: node.id,
            callsiteId: callsite.id,
          },
        ),
      )
      continue
    }
    callsites.set(callsite.id, callsite)
    const port = ports.get(callsite.port)
    if (!port) {
      diagnostics.push(
        diagnostic(
          'node.unknown-port',
          `Node ${node.id} references unknown port ${callsite.port}`,
          {
            graphId,
            nodeId: node.id,
            portId: callsite.port,
            callsiteId: callsite.id,
          },
        ),
      )
      continue
    }
    if (calledPorts.has(port.id)) {
      diagnostics.push(
        diagnostic(
          'node.duplicate-port-callsite',
          `Node ${node.id} has multiple callsites for port ${port.id}`,
          {
            graphId,
            nodeId: node.id,
            portId: port.id,
            callsiteId: callsite.id,
          },
        ),
      )
      continue
    }
    calledPorts.add(port.id)
    if (port.kind !== callsite.kind || port.direction !== callsite.direction) {
      diagnostics.push(
        diagnostic(
          'node.callsite-contract-mismatch',
          `Callsite ${callsite.id} does not match port ${port.id}`,
          {
            graphId,
            nodeId: node.id,
            portId: port.id,
            callsiteId: callsite.id,
          },
        ),
      )
      continue
    }
    const expectedType = portType(port)
    const actualType = callsiteType(callsite)
    if (expectedType && actualType) {
      try {
        resolveTypeExpression(
          types,
          actualType,
        )
        typeArguments = inferTypeArguments(expectedType, actualType, typeArguments)
      } catch (error) {
        diagnostics.push(
          diagnostic(
            'node.callsite-type-mismatch',
            error instanceof Error ? error.message : String(error),
            {
              graphId,
              nodeId: node.id,
              portId: port.id,
              callsiteId: callsite.id,
            },
          ),
        )
      }
    }
  }
  for (const port of definition.contract.ports) {
    if (!calledPorts.has(port.id)) {
      diagnostics.push(
        diagnostic(
          'node.missing-callsite',
          `Node ${node.id} is missing callsite for port ${port.id}`,
          { graphId, nodeId: node.id, portId: port.id },
        ),
      )
    }
  }
  for (const parameter of definition.contract.typeParameters) {
    if (!typeArguments[parameter]) {
      diagnostics.push(
        diagnostic(
          'node.unresolved-generic',
          `Node ${node.id} cannot infer generic ${parameter}`,
          { graphId, nodeId: node.id },
        ),
      )
    }
  }

  for (const reference of findNodeReferences(node.properties)) {
    if (!allNodeIds.has(reference)) {
      diagnostics.push(
        diagnostic(
          'node-ref.unknown-target',
          `NodeRef ${reference} is not in graph instance ${graphId}`,
          { graphId, nodeId: node.id },
          [
            { message: `node ${node.id}`, location: { graphId, nodeId: node.id } },
            { message: `NodeRef ${reference}` },
          ],
        ),
      )
    }
  }

  for (const effect of definition.contract.effects) {
    const capability = EFFECT_CAPABILITIES[effect]
    if (capability && !definition.contract.capabilities.includes(capability)) {
      diagnostics.push(
        diagnostic(
          'node.missing-capability',
          `Effect ${effect} requires capability ${capability}`,
          { graphId, nodeId: node.id, nodeTypeId: node.type },
          [
            { message: `effect ${effect}`, location: { graphId, nodeId: node.id } },
            { message: `capability ${capability}` },
          ],
        ),
      )
    }
  }

  return {
    node,
    definition,
    domain,
    callsites,
    typeArguments,
    properties: parsedProperties.success ? parsedProperties.data : node.properties,
  }
}

function endpoint(
  analyses: ReadonlyMap<string, NodeAnalysis>,
  value: GraphConnection['from'],
): { readonly analysis: NodeAnalysis; readonly callsite: GraphCallsite } | undefined {
  const analysis = analyses.get(value.node)
  const callsite = analysis?.callsites.get(value.callsite)
  return analysis && callsite ? { analysis, callsite } : undefined
}

function operationFor(
  kind: GraphCallsite['kind'],
  fromDomain: SchedulerPhase,
  toDomain: SchedulerPhase,
): PlanConnectionOperation {
  if (kind === 'data') return 'data-dependency'
  if (kind === 'event' || kind === 'trigger') return 'queue-event'
  return fromDomain === toDomain ? 'flow' : 'queue-flow'
}

function dataCycle(
  nodes: readonly string[],
  connections: readonly ExecutionPlanConnection[],
): readonly string[] | undefined {
  const outgoing = new Map(nodes.map((id) => [id, [] as string[]]))
  for (const connection of connections) {
    if (connection.operation !== 'data-dependency') continue
    outgoing.get(connection.from.node)?.push(connection.to.node)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  const visit = (id: string): readonly string[] | undefined => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id)
      return [...stack.slice(start), id]
    }
    if (visited.has(id)) return undefined
    visiting.add(id)
    stack.push(id)
    for (const target of [...(outgoing.get(id) ?? [])].sort()) {
      const cycle = visit(target)
      if (cycle) return cycle
    }
    stack.pop()
    visiting.delete(id)
    visited.add(id)
    return undefined
  }
  for (const id of [...nodes].sort()) {
    const cycle = visit(id)
    if (cycle) return cycle
  }
  return undefined
}

function liveNodes(
  analyses: ReadonlyMap<string, NodeAnalysis>,
  connections: readonly ExecutionPlanConnection[],
): Set<string> {
  const live = new Set<string>()
  for (const analysis of analyses.values()) {
    if (
      analysis.definition.contract.liveness === 'always'
    ) {
      live.add(analysis.node.id)
    }
  }
  for (const connection of connections) {
    const target = analyses.get(connection.to.node)
    if (!target) continue
    if (
      target.definition.contract.liveness === 'on-flow' &&
      (connection.kind === 'flow' || connection.kind === 'trigger')
    ) {
      live.add(target.node.id)
    }
    if (
      target.definition.contract.liveness === 'on-event' &&
      (connection.kind === 'event' || connection.kind === 'trigger')
    ) {
      live.add(target.node.id)
    }
  }
  let changed = true
  while (changed) {
    changed = false
    for (const connection of connections) {
      if (
        connection.operation === 'data-dependency' &&
        live.has(connection.to.node) &&
        !live.has(connection.from.node)
      ) {
        live.add(connection.from.node)
        changed = true
      }
    }
  }
  return live
}

function topologicalOrder(
  live: ReadonlySet<string>,
  connections: readonly ExecutionPlanConnection[],
): string[] {
  const incoming = new Map([...live].map((id) => [id, 0]))
  const outgoing = new Map([...live].map((id) => [id, [] as string[]]))
  for (const connection of connections) {
    if (
      connection.operation !== 'data-dependency' ||
      !live.has(connection.from.node) ||
      !live.has(connection.to.node)
    ) {
      continue
    }
    outgoing.get(connection.from.node)?.push(connection.to.node)
    incoming.set(connection.to.node, (incoming.get(connection.to.node) ?? 0) + 1)
  }
  const ready = [...live].filter((id) => incoming.get(id) === 0).sort()
  const ordered: string[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    ordered.push(id)
    for (const target of [...(outgoing.get(id) ?? [])].sort()) {
      const count = (incoming.get(target) ?? 0) - 1
      incoming.set(target, count)
      if (count === 0) {
        ready.push(target)
        ready.sort()
      }
    }
  }
  return ordered
}

function analyzeCheckpoints(
  analyses: ReadonlyMap<string, NodeAnalysis>,
  connections: readonly ExecutionPlanConnection[],
): ExecutionPlanCheckpoint[] {
  const checkpoints: ExecutionPlanCheckpoint[] = []
  for (const checkpoint of [...analyses.values()]
    .filter((analysis) => analysis.definition.contract.checkpointRole === 'create')
    .sort((left, right) => left.node.id.localeCompare(right.node.id))) {
    const paths = new Map<string, readonly string[]>([
      [checkpoint.node.id, []],
    ])
    const pending = [checkpoint.node.id]
    while (pending.length > 0) {
      const current = pending.shift()!
      const currentPath = paths.get(current)!
      for (const connection of connections) {
        let next: string | undefined
        let cause: string | undefined
        if (
          connection.operation === 'data-dependency' &&
          connection.to.node === current
        ) {
          next = connection.from.node
          cause = `data dependency ${connection.from.node} -> ${connection.to.node}`
        } else if (
          connection.operation !== 'data-dependency' &&
          connection.from.node === current
        ) {
          next = connection.to.node
          cause = `${connection.kind} dependency ${connection.from.node} -> ${connection.to.node}`
        }
        if (next === undefined || cause === undefined || paths.has(next)) continue
        paths.set(next, [...currentPath, cause])
        pending.push(next)
      }
    }

    const scoped = [...paths.keys()]
      .map((id) => analyses.get(id)!)
      .sort((left, right) => left.node.id.localeCompare(right.node.id))
    const dependencies: CheckpointDependency[] = []
    for (const analysis of scoped) {
      const prefix = [
        `checkpoint ${checkpoint.node.id}`,
        ...(paths.get(analysis.node.id) ?? []),
        `node ${analysis.definition.contract.name} (${analysis.node.id})`,
      ]
      for (const read of analysis.definition.contract.reads) {
        if (read.scope === 'dynamic') {
          dependencies.push({
            kind: 'dynamic-physics',
            nodeId: analysis.node.id,
            resource: read.resource,
            causalChain: [...prefix, `dynamic physics read ${read.resource}`],
          })
        } else if (read.scope === 'unprovable') {
          dependencies.push({
            kind: 'unprovable-query',
            nodeId: analysis.node.id,
            resource: read.resource,
            causalChain: [...prefix, `unprovable query ${read.resource}`],
          })
        }
      }
      for (const effect of analysis.definition.contract.effects) {
        if (effect !== 'unknown' && effect !== 'external') continue
        dependencies.push({
          kind: 'unknown-effect',
          nodeId: analysis.node.id,
          effect,
          causalChain: [...prefix, `effect ${effect}`],
        })
      }
      if (analysis.definition.contract.checkpointScope === 'unbounded') {
        dependencies.push({
          kind: 'unbounded-scope',
          nodeId: analysis.node.id,
          causalChain: [...prefix, 'unbounded mutable scope'],
        })
      }
    }
    dependencies.sort((left, right) =>
      `${left.nodeId}:${left.kind}:${left.resource ?? ''}:${left.effect ?? ''}`
        .localeCompare(
          `${right.nodeId}:${right.kind}:${right.resource ?? ''}:${right.effect ?? ''}`,
        ),
    )
    checkpoints.push({
      nodeId: checkpoint.node.id,
      eligible: dependencies.length === 0,
      stateScope: {
        nodes: scoped.map((analysis) => analysis.node.id),
        resources: [...new Set(scoped.flatMap((analysis) => [
          ...analysis.definition.contract.reads.map((read) => read.resource),
          ...analysis.definition.contract.writes.map((write) => write.resource),
        ]))].sort(),
        unbounded: dependencies.some((item) => item.kind === 'unbounded-scope'),
      },
      dependencies,
      asyncPolicies: [],
    })
  }
  return checkpoints
}

function compileInternal(
  input: unknown,
  options: CompileGraphOptions,
  subgraphStack: readonly string[],
): GraphCompileResult {
  const parsed = GraphAssetSchema.safeParse(input)
  if (!parsed.success) {
    return {
      diagnostics: parsed.error.issues.map((issue) =>
        diagnostic(
          'graph.invalid-schema',
          `${issue.path.join('.')}: ${issue.message}`,
          {},
        ),
      ),
    }
  }
  const asset = parsed.data
  const graphId = asset.graph.id
  const diagnostics: GraphDiagnostic[] = []
  const allNodeIds = new Set(asset.graph.nodes.map((node) => node.id))
  const analyses = new Map<string, NodeAnalysis>()
  const seenNodes = new Set<string>()
  for (const node of asset.graph.nodes) {
    if (seenNodes.has(node.id)) {
      diagnostics.push(
        diagnostic(
          'graph.duplicate-node',
          `Duplicate node ID: ${node.id}`,
          { graphId, nodeId: node.id },
        ),
      )
      continue
    }
    seenNodes.add(node.id)
    const definition = options.nodes.get(node.type)
    if (!definition) {
      diagnostics.push(
        diagnostic(
          'registry.unknown-node-type',
          `Unknown node type ID: ${node.type}`,
          { graphId, nodeId: node.id, nodeTypeId: node.type },
        ),
      )
      continue
    }
    const analysis = validateNode(
      graphId,
      node,
      definition,
      options.types,
      allNodeIds,
      diagnostics,
    )
    if (analysis) analyses.set(node.id, analysis)
  }

  const seenPublicPorts = new Set<string>()
  for (const port of asset.graph.publicInterface.ports) {
    if (seenPublicPorts.has(port.id)) {
      diagnostics.push(
        diagnostic(
          'graph.duplicate-public-port',
          `Duplicate public port ID: ${port.id}`,
          { graphId, portId: port.id },
        ),
      )
    }
    seenPublicPorts.add(port.id)
  }

  const planConnections: ExecutionPlanConnection[] = []
  const seenConnections = new Set<string>()
  for (const connection of asset.graph.connections) {
    if (seenConnections.has(connection.id)) {
      diagnostics.push(
        diagnostic(
          'graph.duplicate-connection',
          `Duplicate connection ID: ${connection.id}`,
          { graphId, connectionId: connection.id },
        ),
      )
      continue
    }
    seenConnections.add(connection.id)
    const from = endpoint(analyses, connection.from)
    const to = endpoint(analyses, connection.to)
    if (!from || !to) {
      diagnostics.push(
        diagnostic(
          'connection.unknown-endpoint',
          `Connection ${connection.id} references an unknown node or callsite`,
          { graphId, connectionId: connection.id },
        ),
      )
      continue
    }
    const location = {
      graphId,
      nodeId: to.analysis.node.id,
      portId: to.callsite.port,
      callsiteId: to.callsite.id,
      connectionId: connection.id,
    }
    if (from.callsite.direction !== 'output' || to.callsite.direction !== 'input') {
      diagnostics.push(
        diagnostic(
          'connection.direction-mismatch',
          `Connection ${connection.id} must run from output to input`,
          location,
        ),
      )
      continue
    }
    if (from.callsite.kind !== to.callsite.kind) {
      diagnostics.push(
        diagnostic(
          'connection.kind-mismatch',
          `Cannot connect ${from.callsite.kind} to ${to.callsite.kind}`,
          location,
          [
            {
              message: `source ${from.callsite.kind} port ${from.callsite.port}`,
              location: {
                graphId,
                nodeId: from.analysis.node.id,
                portId: from.callsite.port,
                callsiteId: from.callsite.id,
              },
            },
            {
              message: `target ${to.callsite.kind} port ${to.callsite.port}`,
              location,
            },
          ],
        ),
      )
      continue
    }
    const fromType = callsiteType(from.callsite)
    const toType = callsiteType(to.callsite)
    if (
      fromType &&
      toType &&
      stableFingerprint(fromType) !== stableFingerprint(toType)
    ) {
      diagnostics.push(
        diagnostic(
          'connection.type-mismatch',
          'Connected data types are incompatible; add an explicit conversion node',
          location,
          [
            {
              message: `source type ${JSON.stringify(fromType)}`,
              location: {
                graphId,
                nodeId: from.analysis.node.id,
                portId: from.callsite.port,
                callsiteId: from.callsite.id,
              },
            },
            {
              message: `target type ${JSON.stringify(toType)}`,
              location,
            },
          ],
        ),
      )
      continue
    }
    if (
      from.callsite.kind === 'data' &&
      from.analysis.domain !== to.analysis.domain
    ) {
      diagnostics.push(
        diagnostic(
          'connection.cross-domain-data',
          'Data connections cannot cross scheduler domains; use a typed event',
          location,
        ),
      )
      continue
    }
    planConnections.push({
      id: connection.id,
      kind: from.callsite.kind,
      operation: operationFor(
        from.callsite.kind,
        from.analysis.domain,
        to.analysis.domain,
      ),
      from: connection.from,
      to: connection.to,
    })
  }
  planConnections.sort((left, right) => left.id.localeCompare(right.id))

  const cycle = dataCycle([...analyses.keys()], planConnections)
  if (cycle) {
    diagnostics.push(
      diagnostic(
        'graph.data-cycle',
        `Data dependency cycle: ${cycle.join(' -> ')}`,
        { graphId, nodeId: cycle[0] },
        cycle.map((nodeId) => ({
          message: `data dependency ${nodeId}`,
          location: { graphId, nodeId },
        })),
      ),
    )
  }

  const subgraphs: ExecutionPlanSubgraph[] = []
  for (const analysis of analyses.values()) {
    if (analysis.definition.contract.kind !== 'subgraph') continue
    const reference = analysis.properties.graph
    const assetId =
      typeof reference === 'object' &&
      reference !== null &&
      typeof (reference as { $ref?: unknown }).$ref === 'string'
        ? (reference as { $ref: string }).$ref
        : undefined
    if (!assetId || !options.subgraphs?.has(assetId)) {
      diagnostics.push(
        diagnostic(
          'subgraph.unknown-asset',
          `Unknown subgraph asset: ${String(assetId)}`,
          { graphId, nodeId: analysis.node.id },
          [
            { message: `graph ${graphId}`, location: { graphId } },
            {
              message: `subgraph call ${analysis.node.id}`,
              location: { graphId, nodeId: analysis.node.id },
            },
          ],
        ),
      )
      continue
    }
    if (subgraphStack.includes(assetId)) {
      diagnostics.push(
        diagnostic(
          'subgraph.cycle',
          `Subgraph dependency cycle at ${assetId}`,
          { graphId, nodeId: analysis.node.id },
          subgraphStack.map((id) => ({ message: `subgraph ${id}` })),
        ),
      )
      continue
    }
    const nestedAsset = options.subgraphs.get(assetId)!
    const definitionPorts = new Map(
      analysis.definition.contract.ports.map((port) => [port.id, port]),
    )
    const publicPorts = new Map(
      nestedAsset.graph.publicInterface.ports.map((port) => [port.id, port]),
    )
    for (const port of nestedAsset.graph.publicInterface.ports) {
      const expected = definitionPorts.get(port.id)
      if (
        !expected ||
        expected.kind !== port.kind ||
        expected.direction !== port.direction ||
        stableFingerprint(portType(expected)) !==
          stableFingerprint(
            port.kind === 'data' || port.kind === 'event'
              ? port.type
              : undefined,
          )
      ) {
        diagnostics.push(
          diagnostic(
            'subgraph.interface-mismatch',
            `Subgraph public port ${port.id} does not match node type ${analysis.definition.contract.id}`,
            { graphId, nodeId: analysis.node.id, portId: port.id },
            [
              { message: `graph ${graphId}`, location: { graphId } },
              {
                message: `subgraph call ${analysis.node.id}`,
                location: { graphId, nodeId: analysis.node.id },
              },
              {
                message: `public port ${port.id}`,
                location: {
                  graphId: nestedAsset.graph.id,
                  portId: port.id,
                },
              },
            ],
          ),
        )
      }
    }
    for (const port of analysis.definition.contract.ports) {
      if (!publicPorts.has(port.id)) {
        diagnostics.push(
          diagnostic(
            'subgraph.interface-mismatch',
            `Subgraph is missing public port ${port.id}`,
            { graphId, nodeId: analysis.node.id, portId: port.id },
          ),
        )
      }
    }
    const nested = compileInternal(
      nestedAsset,
      options,
      [...subgraphStack, assetId],
    )
    for (const nestedDiagnostic of nested.diagnostics) {
      diagnostics.push({
        ...nestedDiagnostic,
        causalChain: [
          { message: `graph ${graphId}`, location: { graphId } },
          {
            message: `subgraph call ${analysis.node.id}`,
            location: { graphId, nodeId: analysis.node.id },
          },
          ...nestedDiagnostic.causalChain,
        ],
      })
    }
    if (nested.plan) {
      subgraphs.push({
        nodeId: analysis.node.id,
        assetId,
        graphId: nested.plan.graphId,
      })
    }
  }
  subgraphs.sort((left, right) => left.nodeId.localeCompare(right.nodeId))

  const live = liveNodes(analyses, planConnections)
  for (const analysis of analyses.values()) {
    if (!live.has(analysis.node.id)) {
      diagnostics.push(
        diagnostic(
          'graph.dead-node',
          `Node ${analysis.node.id} is unreachable`,
          { graphId, nodeId: analysis.node.id },
          [],
          'warning',
        ),
      )
    }
  }

  if (diagnostics.some((item) => item.severity === 'error')) {
    return { diagnostics }
  }

  const orderedIds = topologicalOrder(live, planConnections)
  const planNodes = orderedIds.map<ExecutionPlanNode>((id, order) => {
    const analysis = analyses.get(id)!
    return {
      id,
      nodeType: analysis.definition.contract.id,
      version: analysis.definition.contract.version,
      kind: analysis.definition.contract.kind,
      domain: analysis.domain,
      order,
      typeArguments: analysis.typeArguments,
      properties: analysis.properties,
      reads: analysis.definition.contract.reads,
      writes: analysis.definition.contract.writes,
      effects: analysis.definition.contract.effects,
      execution: analysis.definition.contract.execution,
      exportedState: analysis.definition.contract.exportedState,
      checkpoint: analyzeNodeCheckpointEligibility(analysis.definition),
    }
  })
  const checkpoints = analyzeCheckpoints(analyses, planConnections)
  const registryFingerprint = createRegistryFingerprint(options.types, options.nodes)
  const planPayload = {
    schemaVersion: 1 as const,
    graphId,
    registryFingerprint,
    nodes: planNodes,
    connections: planConnections.filter(
      (connection) => live.has(connection.from.node) && live.has(connection.to.node),
    ),
    publicInterface: asset.graph.publicInterface,
    subgraphs,
    checkpoints,
    checkpointEligible: checkpoints.length > 0
      ? checkpoints.every((checkpoint) => checkpoint.eligible)
      : planNodes.every((node) => node.checkpoint.eligible),
  }
  const plan: GraphExecutionPlan = {
    ...planPayload,
    planFingerprint: stableFingerprint({
      graph: asset,
      registryFingerprint,
      plan: planPayload,
    }),
  }
  return { diagnostics, plan }
}

export function compileGraph(
  input: unknown,
  options: CompileGraphOptions,
): GraphCompileResult {
  return compileInternal(input, options, [])
}

export function isExecutionPlanCompatible(
  plan: GraphExecutionPlan,
  types: TypeRegistry,
  nodes: NodeRegistry,
): boolean {
  return plan.registryFingerprint === createRegistryFingerprint(types, nodes)
}

export function executionPlanAsJson(plan: GraphExecutionPlan): JsonValue {
  return JSON.parse(JSON.stringify(plan)) as JsonValue
}
