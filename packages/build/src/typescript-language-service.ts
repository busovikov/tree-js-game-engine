import ts from 'typescript'
import type {
  TypeScriptLanguageDiagnostic,
  TypeScriptLanguageRequest,
  TypeScriptLanguageResult,
} from './browser-worker-clients.js'

function diagnosticSeverity(
  category: ts.DiagnosticCategory,
): TypeScriptLanguageDiagnostic['severity'] {
  return category === ts.DiagnosticCategory.Error ? 'error' : 'warning'
}

export function analyzeTypeScriptProject(
  request: TypeScriptLanguageRequest,
): TypeScriptLanguageResult {
  const files = new Map(Object.entries(request.files))
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    noLib: true,
    skipLibCheck: true,
  }
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => '1',
    getScriptSnapshot: (path) => {
      const text = files.get(path)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getCurrentDirectory: () => '',
    getDefaultLibFileName: () => 'lib.d.ts',
    fileExists: (path) => files.has(path),
    readFile: (path) => files.get(path),
    readDirectory: () => [],
  }
  const service = ts.createLanguageService(host, ts.createDocumentRegistry())
  const diagnostics: TypeScriptLanguageDiagnostic[] = []
  for (const path of files.keys()) {
    if (!/\.[cm]?tsx?$|\.d\.ts$/.test(path)) continue
    const fileDiagnostics = [
      ...service.getSyntacticDiagnostics(path),
      ...service.getSemanticDiagnostics(path),
    ]
    for (const diagnostic of fileDiagnostics) {
      diagnostics.push({
        path: diagnostic.file?.fileName ?? path,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        severity: diagnosticSeverity(diagnostic.category),
        start: diagnostic.start,
        length: diagnostic.length,
      })
    }
  }

  const completionRequest = request.completions
  const completions = completionRequest
    ? (service.getCompletionsAtPosition(
        completionRequest.path,
        completionRequest.position,
        {},
      )?.entries.map((entry) => entry.name) ?? [])
    : []
  service.dispose()
  return { diagnostics, completions }
}
