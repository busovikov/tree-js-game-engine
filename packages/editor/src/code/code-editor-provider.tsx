import { lazy, type LazyExoticComponent } from 'react'
import type { CodeEditorProvider } from './code-editor-types.js'

export type {
  CodeEditorDiagnostic,
  CodeEditorProvider,
  CodeEditorProviderProps,
} from './code-editor-types.js'

export type CodeEditorProviderLoader = () => Promise<{
  default: CodeEditorProvider
}>

export function createLazyCodeEditorProvider(
  loader: CodeEditorProviderLoader = () => import('./monaco-code-editor.js'),
): LazyExoticComponent<CodeEditorProvider> {
  return lazy(loader)
}

export const DefaultCodeEditorProvider = createLazyCodeEditorProvider()
