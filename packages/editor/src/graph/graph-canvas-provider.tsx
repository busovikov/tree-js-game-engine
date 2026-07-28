import { lazy, type LazyExoticComponent } from 'react'
import type { GraphCanvasProvider } from './graph-canvas-types.js'

export type {
  GraphCanvasMove,
  GraphCanvasProvider,
  GraphCanvasProviderProps,
  GraphCanvasTraceEntry,
} from './graph-canvas-types.js'

export type GraphCanvasProviderLoader = () => Promise<{
  default: GraphCanvasProvider
}>

export function createLazyGraphCanvasProvider(
  loader: GraphCanvasProviderLoader = () => import('./react-flow-graph-canvas.js'),
): LazyExoticComponent<GraphCanvasProvider> {
  return lazy(loader)
}

export const DefaultGraphCanvasProvider = createLazyGraphCanvasProvider()
