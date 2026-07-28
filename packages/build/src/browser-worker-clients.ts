import type { BrowserProjectBundles } from './browser-project-tooling.js'

export interface BrowserWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: unknown): void
  terminate(): void
}

export interface TypeScriptLanguageDiagnostic {
  readonly path?: string
  readonly message: string
  readonly severity: 'error' | 'warning'
  readonly start?: number
  readonly length?: number
}

export interface TypeScriptLanguageRequest {
  readonly files: Readonly<Record<string, string>>
  readonly diagnosticPaths?: readonly string[]
  readonly completions?: {
    readonly path: string
    readonly position: number
  }
}

export interface TypeScriptLanguageResult {
  readonly diagnostics: readonly TypeScriptLanguageDiagnostic[]
  readonly completions: readonly string[]
}

export interface BrowserBundleRequest {
  readonly files: Readonly<Record<string, string>>
}

interface WorkerResponse<T> {
  readonly id: number
  readonly ok: boolean
  readonly value?: T
  readonly error?: string
}

class LazyWorkerRpc {
  private worker: BrowserWorkerLike | undefined
  private nextId = 1
  private readonly pending = new Map<
    number,
    {
      resolve(value: unknown): void
      reject(error: Error): void
    }
  >()

  constructor(private readonly workerFactory: () => BrowserWorkerLike) {}

  request<T>(method: string, value: unknown): Promise<T> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
      })
    })
    worker.postMessage({ id, method, value })
    return promise
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = undefined
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Browser tooling worker was disposed.'))
    }
    this.pending.clear()
  }

  private ensureWorker(): BrowserWorkerLike {
    if (this.worker) return this.worker
    const worker = this.workerFactory()
    worker.onmessage = (event: MessageEvent<WorkerResponse<unknown>>) => {
      const response = event.data
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      if (response.ok) pending.resolve(response.value)
      else pending.reject(new Error(response.error ?? 'Browser tooling worker failed.'))
    }
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Browser tooling worker crashed.')
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
    }
    this.worker = worker
    return worker
  }
}

function createTypeScriptWorker(): BrowserWorkerLike {
  return new Worker(new URL('./typescript-language.worker.js', import.meta.url), {
    type: 'module',
  })
}

function createBundlerWorker(): BrowserWorkerLike {
  return new Worker(new URL('./browser-bundle.worker.js', import.meta.url), {
    type: 'module',
  })
}

export class TypeScriptLanguageClient {
  private readonly rpc: LazyWorkerRpc

  constructor(workerFactory: () => BrowserWorkerLike = createTypeScriptWorker) {
    this.rpc = new LazyWorkerRpc(workerFactory)
  }

  analyze(request: TypeScriptLanguageRequest): Promise<TypeScriptLanguageResult> {
    return this.rpc.request('analyze', request)
  }

  dispose(): void {
    this.rpc.dispose()
  }
}

export class BrowserBundlerClient {
  private readonly rpc: LazyWorkerRpc

  constructor(workerFactory: () => BrowserWorkerLike = createBundlerWorker) {
    this.rpc = new LazyWorkerRpc(workerFactory)
  }

  build(request: BrowserBundleRequest): Promise<BrowserProjectBundles> {
    return this.rpc.request('build', request)
  }

  dispose(): void {
    this.rpc.dispose()
  }
}
