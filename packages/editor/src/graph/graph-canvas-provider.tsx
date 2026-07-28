import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type {
  GraphAsset,
  GraphConnectionEndpoint,
  GraphDiagnostic,
} from '@haku/graph'

export interface GraphCanvasTraceEntry {
  readonly nodeId: string
  readonly sequence: number
}

export interface GraphCanvasMove {
  readonly nodeId: string
  readonly x: number
  readonly y: number
}

export interface GraphCanvasProviderProps {
  asset: GraphAsset
  selectedNodeIds: readonly string[]
  diagnostics: readonly GraphDiagnostic[]
  trace: readonly GraphCanvasTraceEntry[]
  portValues: Readonly<Record<string, unknown>>
  onSelectNodes(nodeIds: readonly string[]): void
  onMoveNodes(moves: readonly GraphCanvasMove[]): void
  onDeleteNodes(nodeIds: readonly string[]): void
  onDeleteConnections(connectionIds: readonly string[]): void
  canConnect(from: GraphConnectionEndpoint, to: GraphConnectionEndpoint): boolean
  onConnect(from: GraphConnectionEndpoint, to: GraphConnectionEndpoint): void
}

export type GraphCanvasProvider = ComponentType<GraphCanvasProviderProps>

export type GraphCanvasProviderLoader = () => Promise<{
  default: GraphCanvasProvider
}>

export function createLazyGraphCanvasProvider(
  loader: GraphCanvasProviderLoader = () => import('./react-flow-graph-canvas.js'),
): LazyExoticComponent<GraphCanvasProvider> {
  return lazy(loader)
}

export const DefaultGraphCanvasProvider = createLazyGraphCanvasProvider()
