import { describe, expect, it, vi } from 'vitest'
import {
  BrowserBundlerClient,
  TypeScriptLanguageClient,
  type BrowserWorkerLike,
} from './browser-worker-clients.js'

class FakeWorker implements BrowserWorkerLike {
  readonly postMessage = vi.fn()
  readonly terminate = vi.fn()
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
}

describe('lazy browser tooling workers', () => {
  it('does not create TypeScript or bundler workers until the first request', () => {
    const typescriptFactory = vi.fn(() => new FakeWorker())
    const bundlerFactory = vi.fn(() => new FakeWorker())

    const typescript = new TypeScriptLanguageClient(typescriptFactory)
    const bundler = new BrowserBundlerClient(bundlerFactory)

    expect(typescriptFactory).not.toHaveBeenCalled()
    expect(bundlerFactory).not.toHaveBeenCalled()
    typescript.dispose()
    bundler.dispose()
  })

  it('routes requests through one worker and destroys it on dispose', async () => {
    const worker = new FakeWorker()
    const client = new BrowserBundlerClient(() => worker)
    const pending = client.build({
      files: {
        'src/gameplay.ts': 'export const gameplay = true',
        'src/editor-extension.ts': 'export const editor = true',
      },
    })
    const request = worker.postMessage.mock.calls[0]?.[0] as { id: number }
    worker.onmessage?.(
      new MessageEvent('message', {
        data: {
          id: request.id,
          ok: true,
          value: { gameplay: 'game bundle', editorExtension: 'editor bundle' },
        },
      }),
    )

    await expect(pending).resolves.toEqual({
      gameplay: 'game bundle',
      editorExtension: 'editor bundle',
    })
    client.dispose()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
