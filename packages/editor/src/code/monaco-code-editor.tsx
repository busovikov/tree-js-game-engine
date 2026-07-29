import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import type { CodeEditorProviderProps } from './code-editor-types.js'
import './monaco-code-editor.css'

type MonacoWorkerEnvironment = {
  getWorker(moduleId: string, label: string): Worker
}

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment
}

monacoGlobal.MonacoEnvironment ??= {
  getWorker(_moduleId, label) {
    return label === 'typescript' || label === 'javascript'
      ? new TypeScriptWorker()
      : new EditorWorker()
  },
}

monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ESNext,
  module: monaco.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  strict: true,
  noEmit: true,
})
monaco.typescript.typescriptDefaults.setEagerModelSync(true)

function projectUri(path: string): monaco.Uri {
  return monaco.Uri.parse(`file:///workspace/${path.replace(/^\/+/, '')}`)
}

export default function MonacoCodeEditor({
  path,
  value,
  readOnly = false,
  diagnostics = [],
  projectFiles = {},
  reveal,
  onChange,
}: CodeEditorProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const uri = projectUri(path)
    const model =
      monaco.editor.getModel(uri) ?? monaco.editor.createModel(value, 'typescript', uri)
    const editor = monaco.editor.create(container, {
      model,
      automaticLayout: true,
      editContext: false,
      minimap: { enabled: false },
      readOnly,
      theme: 'vs-dark',
    })
    const subscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(model.getValue())
    })
    editorRef.current = editor
    return () => {
      subscription.dispose()
      editor.dispose()
      editorRef.current = undefined
      model.dispose()
    }
  }, [path])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model && model.getValue() !== value) model.setValue(value)
  }, [value])

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly })
  }, [readOnly])

  useEffect(() => {
    const ownedModels: monaco.editor.ITextModel[] = []
    for (const [filePath, text] of Object.entries(projectFiles)) {
      if (filePath === path) continue
      const uri = projectUri(filePath)
      const existing = monaco.editor.getModel(uri)
      if (existing) {
        if (existing.getValue() !== text) existing.setValue(text)
      } else {
        ownedModels.push(monaco.editor.createModel(text, 'typescript', uri))
      }
    }
    return () => {
      for (const model of ownedModels) model.dispose()
    }
  }, [path, projectFiles])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (!model) return
    monaco.editor.setModelMarkers(
      model,
      'haku',
      diagnostics.map((diagnostic) => ({
        message: diagnostic.message,
        severity:
          diagnostic.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : diagnostic.severity === 'warning'
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
        startLineNumber: diagnostic.line ?? 1,
        startColumn: diagnostic.column ?? 1,
        endLineNumber: diagnostic.line ?? 1,
        endColumn: (diagnostic.column ?? 1) + 1,
      })),
    )
  }, [diagnostics])

  useEffect(() => {
    if (!reveal) return
    editorRef.current?.setPosition({
      lineNumber: reveal.line,
      column: reveal.column,
    })
    editorRef.current?.revealPositionInCenter({
      lineNumber: reveal.line,
      column: reveal.column,
    })
    editorRef.current?.focus()
  }, [reveal])

  return <div className="haku-monaco-editor" ref={containerRef} />
}
