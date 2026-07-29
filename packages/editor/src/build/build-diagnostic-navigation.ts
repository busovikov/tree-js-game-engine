import type { BrowserStaticExportSourceLocation } from '@haku/build'

export type BuildDiagnosticWorkspace = 'graph' | 'code' | 'ui'

export interface BuildDiagnosticNavigationTarget {
  readonly workspace: BuildDiagnosticWorkspace
  readonly path: string
  readonly selectionId?: string
  readonly line?: number
  readonly column?: number
}

type NavigationListener = (target: BuildDiagnosticNavigationTarget) => void

let latestTarget: BuildDiagnosticNavigationTarget | undefined
const listeners = new Set<NavigationListener>()

export function buildDiagnosticNavigationTarget(
  source: BrowserStaticExportSourceLocation,
): BuildDiagnosticNavigationTarget {
  if (source.kind === 'graph') {
    return {
      workspace: 'graph',
      path: source.path,
      selectionId: source.nodeId ?? source.graphId,
    }
  }
  if (source.kind === 'ui') {
    return {
      workspace: 'ui',
      path: source.path,
      selectionId: source.uiElementId ?? source.uiDocumentId,
    }
  }
  return {
    workspace: 'code',
    path: source.path,
    selectionId: source.kind === 'type' ? source.typeId : undefined,
    line: source.line,
    column: source.column,
  }
}

export function navigateToBuildDiagnostic(
  source: BrowserStaticExportSourceLocation,
): void {
  latestTarget = buildDiagnosticNavigationTarget(source)
  for (const listener of listeners) listener(latestTarget)
}

export function subscribeBuildDiagnosticNavigation(
  listener: NavigationListener,
): () => void {
  listeners.add(listener)
  if (latestTarget) listener(latestTarget)
  return () => listeners.delete(listener)
}
