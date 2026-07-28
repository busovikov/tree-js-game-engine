import { describe, expect, it, vi } from 'vitest'
import {
  buildBrowserProject,
  type BrowserBuildWorker,
  type BrowserProjectBuildRequest,
} from './browser-project-tooling.js'

const BASE_REQUEST = {
  projectId: '10000000-0000-4000-8000-000000000001',
  files: {
    'src/gameplay.ts': 'export const value = 1',
  },
  capabilities: {
    requested: [],
    approved: [],
  },
} satisfies Omit<BrowserProjectBuildRequest, 'trustMode'>

describe('browser project trust boundary', () => {
  it('returns a typed trust diagnostic without invoking build workers for imported code', async () => {
    const worker: BrowserBuildWorker = {
      build: vi.fn(async () => ({
        gameplay: 'compiled gameplay',
        editorExtension: 'compiled editor extension',
      })),
    }

    const result = await buildBrowserProject(
      {
        ...BASE_REQUEST,
        trustMode: 'imported-untrusted',
      },
      worker,
    )

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: 'trust.untrusted-code',
          kind: 'trust',
          severity: 'error',
          message: 'Imported project code must be trusted before it can be compiled.',
        },
      ],
    })
    expect(worker.build).not.toHaveBeenCalled()
  })

  it('allows a local trusted project to invoke the injected build worker', async () => {
    const worker: BrowserBuildWorker = {
      build: vi.fn(async () => ({
        gameplay: 'compiled gameplay',
        editorExtension: 'compiled editor extension',
      })),
    }

    const result = await buildBrowserProject(
      {
        ...BASE_REQUEST,
        trustMode: 'local-trusted',
      },
      worker,
    )

    expect(result).toEqual({
      ok: true,
      bundles: {
        gameplay: 'compiled gameplay',
        editorExtension: 'compiled editor extension',
      },
      diagnostics: [],
    })
    expect(worker.build).toHaveBeenCalledOnce()
  })
})
