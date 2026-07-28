import type {
  GraphAsset,
  GraphCompileResult,
  GraphDiagnosticLocation,
  NodeRegistry,
} from '@haku/graph'

export interface GraphPaletteItem {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly description: string
}

export interface NavigableGraphDiagnostic {
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly causalChain: readonly string[]
  readonly navigateTo: GraphDiagnosticLocation
}

export interface GraphCheckpointInspector {
  readonly eligible: boolean
  readonly dynamicPhysicsRejected: boolean
  readonly dependencies: readonly {
    readonly kind: string
    readonly causalChain: readonly string[]
  }[]
  readonly asyncPolicies: readonly {
    readonly nodeId: string
    readonly callsiteId: string
    readonly live: boolean
    readonly dominatesCheckpoint: boolean
    readonly supported: readonly string[]
    readonly causalChain: readonly string[]
  }[]
}

export interface GraphInspectorModel {
  readonly selectedNode?: {
    readonly id: string
    readonly name: string
    readonly category: string
    readonly description: string
    readonly properties: Readonly<Record<string, unknown>>
    readonly effects: readonly string[]
    readonly asyncCheckpointPolicies: readonly string[]
  }
  readonly checkpoint?: GraphCheckpointInspector
  readonly diagnostics: readonly NavigableGraphDiagnostic[]
}

export function searchGraphPalette(
  registry: NodeRegistry,
  query: string,
): readonly GraphPaletteItem[] {
  const normalized = query.trim().toLowerCase()
  return registry.all()
    .filter((definition) => {
      if (!normalized) return true
      const contract = definition.contract
      return [contract.name, contract.category, contract.description]
        .some((value) => value.toLowerCase().includes(normalized))
    })
    .map(({ contract }) => ({
      id: contract.id,
      name: contract.name,
      category: contract.category,
      description: contract.description,
    }))
    .sort((left, right) =>
      `${left.category}:${left.name}`.localeCompare(`${right.category}:${right.name}`)
    )
}

export function createGraphInspectorModel(
  asset: GraphAsset,
  registry: NodeRegistry,
  compiled: GraphCompileResult,
  selectedNodeId?: string,
): GraphInspectorModel {
  const node = asset.graph.nodes.find((candidate) => candidate.id === selectedNodeId)
  const definition = node ? registry.get(node.type) : undefined
  const checkpoint = compiled.plan?.checkpoints.find(
    (candidate) => candidate.nodeId === selectedNodeId,
  )
  const diagnostics: NavigableGraphDiagnostic[] = compiled.diagnostics.map((item) => ({
    code: item.code,
    severity: item.severity,
    message: item.message,
    causalChain: item.causalChain.map((cause) => cause.message),
    navigateTo: item.location,
  }))
  for (const item of compiled.plan?.checkpoints ?? []) {
    for (const dependency of item.dependencies) {
      diagnostics.push({
        code: `checkpoint.${dependency.kind}`,
        severity: 'warning',
        message: dependency.causalChain.at(-1) ?? dependency.kind,
        causalChain: dependency.causalChain,
        navigateTo: {
          graphId: asset.graph.id,
          nodeId: dependency.nodeId,
        },
      })
    }
  }

  return {
    selectedNode: node && definition
      ? {
          id: node.id,
          name: definition.contract.name,
          category: definition.contract.category,
          description: definition.contract.description,
          properties: node.properties,
          effects: definition.contract.effects,
          asyncCheckpointPolicies: definition.contract.asyncCheckpointPolicies,
        }
      : undefined,
    checkpoint: checkpoint
      ? {
          eligible: checkpoint.eligible,
          dynamicPhysicsRejected: checkpoint.dependencies.some(
            (dependency) => dependency.kind === 'dynamic-physics',
          ),
          dependencies: checkpoint.dependencies.map((dependency) => ({
            kind: dependency.kind,
            causalChain: dependency.causalChain,
          })),
          asyncPolicies: checkpoint.asyncPolicies,
        }
      : undefined,
    diagnostics,
  }
}
