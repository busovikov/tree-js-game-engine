import { analyzeTypeScriptProject } from './typescript-language-service.js'
import type { TypeScriptLanguageRequest } from './browser-worker-clients.js'

interface WorkerRequest {
  readonly id: number
  readonly method: 'analyze'
  readonly value: TypeScriptLanguageRequest
}

globalThis.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    const value = analyzeTypeScriptProject(request.value)
    globalThis.postMessage({ id: request.id, ok: true, value })
  } catch (error) {
    globalThis.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
