/**
 * @vitest-environment happy-dom
 */
import { BrowserPlatformAdapter } from '@haku/platform'
import { InMemorySaveStorage } from '@haku/storage'
import { describe, expect, it } from 'vitest'
import { createStoragePlatformDiagnostic } from './storage-platform-diagnostic.js'

describe('M10d storage and platform diagnostic', () => {
  it('shows roundtrip, conflict, quota estimate, and lifecycle capabilities', async () => {
    const host = document.createElement('div')
    const storage = new InMemorySaveStorage({ quotaBytes: 10_000 })
    const platform = new BrowserPlatformAdapter({
      documentTarget: document,
      windowTarget: window,
    })
    const diagnostic = createStoragePlatformDiagnostic(host, {
      storage,
      platform,
      storageBackend: 'in-memory-test',
    })
    await diagnostic.ready

    ;(host.querySelector('[data-storage-action="roundtrip"]') as HTMLButtonElement)
      .click()
    await flushAsyncEvents()
    expect(host.dataset.storageRoundtrip).toBe('true')
    expect(host.dataset.storageRevision).toBe('1')

    ;(host.querySelector('[data-storage-action="conflict"]') as HTMLButtonElement)
      .click()
    await flushAsyncEvents()
    expect(host.dataset.storageConflict).toBe('true')
    expect(host.dataset.storageRevision).toBe('1')

    ;(host.querySelector('[data-storage-action="estimate"]') as HTMLButtonElement)
      .click()
    await flushAsyncEvents()
    expect(Number(host.dataset.storageUsage)).toBeGreaterThan(0)
    expect(host.dataset.storageQuota).toBe('10000')
    expect(host.dataset.platformVisibility).toBe('visible')
    expect(host.dataset.platformPaused).toBe('false')
    expect(host.textContent).toContain('Local save')
    expect(host.textContent).toContain('Lifecycle')

    diagnostic.destroy()
    expect(host.childElementCount).toBe(0)
  })
})

async function flushAsyncEvents(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
}
