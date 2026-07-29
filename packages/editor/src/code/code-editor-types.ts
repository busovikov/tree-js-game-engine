import type { ComponentType } from 'react'

export interface CodeEditorDiagnostic {
  readonly message: string
  readonly severity: 'error' | 'warning' | 'info'
  readonly line?: number
  readonly column?: number
}

export interface CodeEditorProviderProps {
  readonly path: string
  readonly value: string
  readonly readOnly?: boolean
  readonly diagnostics?: readonly CodeEditorDiagnostic[]
  readonly projectFiles?: Readonly<Record<string, string>>
  readonly reveal?: {
    readonly line: number
    readonly column: number
  }
  onChange(value: string): void
  onReloadRequested?(): void
}

export type CodeEditorProvider = ComponentType<CodeEditorProviderProps>
