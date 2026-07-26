export type GraphDiagnosticSeverity = 'error' | 'warning'

export interface GraphDiagnosticLocation {
  readonly graphId?: string
  readonly nodeId?: string
  readonly nodeTypeId?: string
  readonly portId?: string
  readonly callsiteId?: string
  readonly connectionId?: string
}

export interface GraphDiagnosticCause {
  readonly message: string
  readonly location?: GraphDiagnosticLocation
}

export interface GraphDiagnostic {
  readonly code: string
  readonly severity: GraphDiagnosticSeverity
  readonly message: string
  readonly location: GraphDiagnosticLocation
  readonly causalChain: readonly GraphDiagnosticCause[]
}

export class GraphDiagnosticError extends Error {
  readonly diagnostics: readonly GraphDiagnostic[]

  constructor(diagnostics: readonly GraphDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'))
    this.name = 'GraphDiagnosticError'
    this.diagnostics = diagnostics
  }
}
