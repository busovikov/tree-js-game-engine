import {
  GraphAssetSchema,
  compileGraph,
  type GraphAsset,
  type GraphCompileResult,
  type GraphConnectionEndpoint,
  type GraphNode,
  type NodeRegistry,
  type TypeExpression,
  type TypeRegistry,
} from '@haku/graph'
import type { Command, CommandBus } from '../commands/command-bus.js'

export interface GraphAssetStorage {
  readText(path: string): Promise<string>
  writeText(path: string, value: string): Promise<void>
}

type GraphAuthoringListener = () => void

export interface GraphAuthoringEnvironment {
  readonly nodes: NodeRegistry
  readonly types: TypeRegistry
  readonly uuid?: () => string
}

export interface GraphPosition {
  readonly x: number
  readonly y: number
}

export interface GraphConnectionValidation {
  readonly valid: boolean
  readonly reason?: string
}

interface GraphClipboard {
  readonly nodes: readonly GraphNode[]
  readonly connections: GraphAsset['graph']['connections']
}

function cloneAsset(asset: GraphAsset): GraphAsset {
  return GraphAssetSchema.parse(structuredClone(asset))
}

function serialized(asset: GraphAsset | null): string | null {
  return asset ? JSON.stringify(asset) : null
}

export function createEmptyGraphAsset(
  name: string,
  id: GraphAsset['graph']['id'] = crypto.randomUUID(),
): GraphAsset {
  return GraphAssetSchema.parse({
    schemaVersion: 1,
    graph: {
      id,
      name,
      nodes: [],
      connections: [],
      publicInterface: { ports: [] },
      metadata: {},
    },
  })
}

class ReplaceGraphAssetCommand implements Command {
  constructor(
    private readonly session: GraphAuthoringSession,
    private readonly before: GraphAsset | null,
    private readonly after: GraphAsset,
    private readonly path: string,
  ) {}

  execute(): void {
    this.session.apply(this.after, this.path)
  }

  undo(): void {
    this.session.apply(this.before, this.path)
  }
}

export class GraphAuthoringSession {
  private currentAsset: GraphAsset | null = null
  private currentPath: string | null = null
  private savedAssetJson: string | null = null
  private listeners = new Set<GraphAuthoringListener>()
  private selectedIds: string[] = []
  private clipboard: GraphClipboard | null = null

  constructor(
    private readonly commands: CommandBus,
    private readonly storage: GraphAssetStorage,
    private readonly environment?: GraphAuthoringEnvironment,
  ) {}

  get asset(): GraphAsset | null {
    return this.currentAsset
  }

  get path(): string | null {
    return this.currentPath
  }

  get isDirty(): boolean {
    return serialized(this.currentAsset) !== this.savedAssetJson
  }

  get selectedNodeIds(): readonly string[] {
    return this.selectedIds
  }

  subscribe(listener: GraphAuthoringListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  create(path: string, name: string, id?: GraphAsset['graph']['id']): void {
    const asset = createEmptyGraphAsset(name, id)
    this.commands.execute(
      new ReplaceGraphAssetCommand(this, this.currentAsset, asset, path),
    )
  }

  async open(path: string): Promise<GraphAsset> {
    const asset = GraphAssetSchema.parse(JSON.parse(await this.storage.readText(path)))
    this.openAsset(path, asset)
    return asset
  }

  openAsset(path: string, input: unknown): GraphAsset {
    const asset = GraphAssetSchema.parse(input)
    this.currentAsset = cloneAsset(asset)
    this.currentPath = path
    this.savedAssetJson = serialized(asset)
    this.selectedIds = []
    this.notify()
    return asset
  }

  replaceAsset(asset: unknown): void {
    if (!this.currentPath) throw new Error('No graph asset open')
    const next = GraphAssetSchema.parse(asset)
    this.commands.execute(
      new ReplaceGraphAssetCommand(this, this.currentAsset, next, this.currentPath),
    )
  }

  addNode(
    nodeTypeId: string,
    position: GraphPosition,
    properties: Record<string, unknown>,
  ): string {
    const asset = this.requireAsset()
    const environment = this.requireEnvironment()
    const definition = environment.nodes.require(nodeTypeId)
    const id = this.uuid()
    const node = {
      id,
      type: definition.contract.id,
      version: definition.contract.version,
      callsites: definition.contract.ports.map((port) => ({
        id: this.uuid(),
        port: port.id,
        direction: port.direction,
        kind: port.kind,
        ...(port.kind === 'data' || port.kind === 'event'
          ? { type: port.type }
          : {}),
      })),
      properties: definition.propertySchema.parse(properties),
      layout: { x: position.x, y: position.y },
      domain: definition.contract.domains[0],
    }
    this.replaceAsset({
      ...asset,
      graph: {
        ...asset.graph,
        nodes: [...asset.graph.nodes, node],
      },
    })
    this.selectNodes([id])
    return id
  }

  moveNodes(moves: readonly ({ readonly nodeId: string } & GraphPosition)[]): void {
    const asset = this.requireAsset()
    const positions = new Map(moves.map((move) => [move.nodeId, move]))
    this.replaceAsset({
      ...asset,
      graph: {
        ...asset.graph,
        nodes: asset.graph.nodes.map((node) => {
          const move = positions.get(node.id)
          return move
            ? { ...node, layout: { ...node.layout, x: move.x, y: move.y } }
            : node
        }),
      },
    })
  }

  updateNodeProperties(nodeId: string, properties: Record<string, unknown>): void {
    const asset = this.requireAsset()
    const node = asset.graph.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) throw new Error(`Unknown graph node: ${nodeId}`)
    const definition = this.requireEnvironment().nodes.require(node.type)
    const parsed = definition.propertySchema.parse(properties)
    this.replaceAsset({
      ...asset,
      graph: {
        ...asset.graph,
        nodes: asset.graph.nodes.map((candidate) =>
          candidate.id === nodeId ? { ...candidate, properties: parsed } : candidate
        ),
      },
    })
  }

  canConnect(
    from: GraphConnectionEndpoint,
    to: GraphConnectionEndpoint,
  ): GraphConnectionValidation {
    const asset = this.requireAsset()
    const source = this.findCallsite(asset, from)
    const target = this.findCallsite(asset, to)
    if (source.direction !== 'output' || target.direction !== 'input') {
      return { valid: false, reason: 'Connections must run from output to input' }
    }
    if (source.kind !== target.kind) {
      return { valid: false, reason: 'Incompatible port kinds' }
    }
    if (
      (source.kind === 'data' || source.kind === 'event') &&
      (target.kind === 'data' || target.kind === 'event') &&
      !typeExpressionsCompatible(source.type, target.type)
    ) {
      return { valid: false, reason: 'Incompatible data types' }
    }
    if (
      asset.graph.connections.some((connection) =>
        connection.to.node === to.node && connection.to.callsite === to.callsite
      )
    ) {
      return { valid: false, reason: 'Input already connected' }
    }
    return { valid: true }
  }

  connect(from: GraphConnectionEndpoint, to: GraphConnectionEndpoint): string {
    const validation = this.canConnect(from, to)
    if (!validation.valid) throw new Error(validation.reason)
    const asset = this.requireAsset()
    const id = this.uuid()
    this.replaceAsset({
      ...asset,
      graph: {
        ...asset.graph,
        connections: [...asset.graph.connections, { id, from, to }],
      },
    })
    return id
  }

  selectNodes(nodeIds: readonly string[]): void {
    const existing = new Set(this.currentAsset?.graph.nodes.map((node) => node.id) ?? [])
    this.selectedIds = [...new Set(nodeIds)].filter((id) => existing.has(id))
    this.notify()
  }

  copySelection(): void {
    const asset = this.requireAsset()
    const selected = new Set(this.selectedIds)
    this.clipboard = {
      nodes: asset.graph.nodes
        .filter((node) => selected.has(node.id))
        .map((node) => structuredClone(node)),
      connections: asset.graph.connections
        .filter((connection) =>
          selected.has(connection.from.node) && selected.has(connection.to.node)
        )
        .map((connection) => structuredClone(connection)),
    }
  }

  paste(offset: GraphPosition = { x: 24, y: 24 }): readonly string[] {
    if (!this.clipboard || this.clipboard.nodes.length === 0) return []
    const asset = this.requireAsset()
    const nodeIds = new Map<string, string>()
    const callsiteIds = new Map<string, string>()
    const nodes = this.clipboard.nodes.map((node) => {
      const id = this.uuid()
      nodeIds.set(node.id, id)
      const callsites = node.callsites.map((callsite) => {
        const callsiteId = this.uuid()
        callsiteIds.set(callsite.id, callsiteId)
        return { ...callsite, id: callsiteId }
      })
      return {
        ...node,
        id,
        callsites,
        layout: {
          ...node.layout,
          x: node.layout.x + offset.x,
          y: node.layout.y + offset.y,
        },
      }
    })
    const connections = this.clipboard.connections.map((connection) => ({
      ...connection,
      id: this.uuid(),
      from: {
        node: nodeIds.get(connection.from.node)!,
        callsite: callsiteIds.get(connection.from.callsite)!,
      },
      to: {
        node: nodeIds.get(connection.to.node)!,
        callsite: callsiteIds.get(connection.to.callsite)!,
      },
    }))
    this.replaceAsset({
      ...asset,
      graph: {
        ...asset.graph,
        nodes: [...asset.graph.nodes, ...nodes],
        connections: [...asset.graph.connections, ...connections],
      },
    })
    const pasted = nodes.map((node) => node.id)
    this.selectNodes(pasted)
    return pasted
  }

  duplicateSelection(): readonly string[] {
    this.copySelection()
    return this.paste()
  }

  deleteSelection(): void {
    const asset = this.requireAsset()
    const selected = new Set(this.selectedIds)
    if (selected.size === 0) return
    this.replaceAsset({
      ...asset,
      graph: {
        ...asset.graph,
        nodes: asset.graph.nodes.filter((node) => !selected.has(node.id)),
        connections: asset.graph.connections.filter((connection) =>
          !selected.has(connection.from.node) && !selected.has(connection.to.node)
        ),
      },
    })
    this.selectNodes([])
  }

  deleteConnections(connectionIds: readonly string[]): void {
    const asset = this.requireAsset()
    const deleted = new Set(connectionIds)
    if (deleted.size === 0) return
    this.replaceAsset({
      ...asset,
      graph: {
        ...asset.graph,
        connections: asset.graph.connections.filter(
          (connection) => !deleted.has(connection.id),
        ),
      },
    })
  }

  compile(): GraphCompileResult {
    const environment = this.requireEnvironment()
    return compileGraph(this.requireAsset(), {
      nodes: environment.nodes,
      types: environment.types,
    })
  }

  async save(): Promise<void> {
    if (!this.currentAsset || !this.currentPath) {
      throw new Error('No graph asset open')
    }
    const validated = GraphAssetSchema.parse(this.currentAsset)
    await this.storage.writeText(this.currentPath, `${JSON.stringify(validated, null, 2)}\n`)
    this.savedAssetJson = serialized(validated)
    this.notify()
  }

  close(): void {
    this.currentAsset = null
    this.currentPath = null
    this.savedAssetJson = null
    this.selectedIds = []
    this.notify()
  }

  apply(asset: GraphAsset | null, path: string): void {
    this.currentAsset = asset ? cloneAsset(asset) : null
    this.currentPath = asset ? path : null
    if (asset) {
      const ids = new Set(asset.graph.nodes.map((node) => node.id))
      this.selectedIds = this.selectedIds.filter((id) => ids.has(id))
    } else {
      this.selectedIds = []
    }
    this.notify()
  }

  private requireAsset(): GraphAsset {
    if (!this.currentAsset) throw new Error('No graph asset open')
    return this.currentAsset
  }

  private requireEnvironment(): GraphAuthoringEnvironment {
    if (!this.environment) throw new Error('Graph authoring registries are unavailable')
    return this.environment
  }

  private uuid(): string {
    return this.environment?.uuid?.() ?? crypto.randomUUID()
  }

  private findCallsite(asset: GraphAsset, endpoint: GraphConnectionEndpoint) {
    const node = asset.graph.nodes.find((candidate) => candidate.id === endpoint.node)
    const callsite = node?.callsites.find((candidate) => candidate.id === endpoint.callsite)
    if (!callsite) throw new Error(`Unknown graph callsite: ${endpoint.callsite}`)
    return callsite
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function typeExpressionsCompatible(
  source: TypeExpression,
  target: TypeExpression,
): boolean {
  if (source.kind === 'generic' || target.kind === 'generic') return true
  if (source.type !== target.type || source.arguments.length !== target.arguments.length) {
    return false
  }
  return source.arguments.every((argument, index) =>
    typeExpressionsCompatible(argument, target.arguments[index]!)
  )
}
