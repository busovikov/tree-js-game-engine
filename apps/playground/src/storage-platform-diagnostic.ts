import {
  BrowserPlatformAdapter,
  type PlatformAdapter,
  type PlatformCapabilities,
  type PlatformLifecycleState,
  type PlatformRuntimeControls,
} from '@haku/platform'
import {
  IndexedDbSaveStorage,
  SaveStorageConflictError,
  type ISaveStorage,
} from '@haku/storage'

const DIAGNOSTIC_SLOT = 'm10d-local-diagnostic'

export interface StoragePlatformDiagnosticOptions {
  storage?: ISaveStorage
  platform?: PlatformAdapter
  storageBackend?: string
}

export interface StoragePlatformDiagnostic {
  readonly ready: Promise<void>
  destroy(): void
}

export function createObservedPlatformControls(
  host: HTMLElement,
  controls: PlatformRuntimeControls,
): PlatformRuntimeControls {
  const observed: PlatformRuntimeControls = {}
  if (controls.setSimulationPaused !== undefined) {
    observed.setSimulationPaused = async (paused) => {
      await controls.setSimulationPaused!(paused)
      host.dataset.platformSimulationPaused = String(paused)
    }
  }
  if (controls.setInputEnabled !== undefined) {
    observed.setInputEnabled = async (enabled) => {
      await controls.setInputEnabled!(enabled)
      host.dataset.platformInputEnabled = String(enabled)
    }
  }
  if (controls.setAudioPaused !== undefined) {
    observed.setAudioPaused = async (paused) => {
      await controls.setAudioPaused!(paused)
      host.dataset.platformAudioPaused = String(paused)
    }
  }
  return observed
}

export function createStoragePlatformDiagnostic(
  host: HTMLElement,
  options: StoragePlatformDiagnosticOptions = {},
): StoragePlatformDiagnostic {
  const storage = options.storage ?? new IndexedDbSaveStorage({
    databaseName: 'haku-m10d-diagnostic-v1',
  })
  const platform = options.platform ?? new BrowserPlatformAdapter()
  let destroyed = false

  Object.assign(host.style, {
    color: '#f5f7ff',
    background: '#171a2b',
    border: '1px solid #8e7dff',
    borderRadius: '10px',
    padding: '14px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
  })
  host.setAttribute('role', 'region')
  host.setAttribute('aria-label', 'M10d local storage and platform diagnostic')
  host.innerHTML = `
    <strong style="display:block;color:#b8adff;font-size:16px;margin-bottom:8px">Local Save + Platform</strong>
    <div data-storage-status role="status" style="margin-bottom:8px">Initializing local save</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      <button type="button" data-storage-action="roundtrip">IndexedDB roundtrip</button>
      <button type="button" data-storage-action="conflict">Prove stale conflict</button>
      <button type="button" data-storage-action="estimate">Refresh quota estimate</button>
    </div>
    <div data-platform-status>Lifecycle: initializing</div>
    <div data-platform-capabilities>Capabilities: initializing</div>
  `
  host.dataset.storageBackend = options.storageBackend ?? 'indexeddb'
  host.dataset.storageRoundtrip = 'false'
  host.dataset.storageConflict = 'false'

  const status = host.querySelector<HTMLElement>('[data-storage-status]')!
  const platformStatus =
    host.querySelector<HTMLElement>('[data-platform-status]')!
  const capabilityStatus =
    host.querySelector<HTMLElement>('[data-platform-capabilities]')!

  const renderLifecycle = (state: PlatformLifecycleState): void => {
    if (destroyed) return
    host.dataset.platformVisibility = state.visibility
    host.dataset.platformFocus = state.focus
    host.dataset.platformPaused = String(state.paused)
    host.dataset.platformPauseReasons = state.pauseReasons.join(',')
    platformStatus.textContent =
      `Lifecycle: ${state.visibility}, ${state.focus}, `
      + (state.paused ? `paused (${state.pauseReasons.join(', ')})` : 'running')
  }

  const renderCapabilities = (capabilities: PlatformCapabilities): void => {
    if (destroyed) return
    host.dataset.platformCapabilities = JSON.stringify(capabilities)
    capabilityStatus.textContent =
      `Capabilities: lifecycle ${yesNo(capabilities.lifecycle)}, `
      + `auth ${yesNo(capabilities.auth)}, pause ${yesNo(capabilities.pause)}, `
      + `input ${yesNo(capabilities.input)}, audio ${yesNo(capabilities.audio)}`
  }

  const refreshEstimate = async (): Promise<void> => {
    const estimate = await storage.estimate()
    if (estimate.usage === undefined) delete host.dataset.storageUsage
    else host.dataset.storageUsage = String(estimate.usage)
    if (estimate.quota === undefined) delete host.dataset.storageQuota
    else host.dataset.storageQuota = String(estimate.quota)
    const usage = estimate.usage === undefined ? 'unknown' : formatBytes(estimate.usage)
    const quota = estimate.quota === undefined ? 'unknown' : formatBytes(estimate.quota)
    status.textContent = `Local save estimate: ${usage} used of ${quota}`
  }

  const roundtrip = async (): Promise<void> => {
    const current = await storage.readSlot<{ sequence: number }>(DIAGNOSTIC_SLOT)
    const written = await storage.writeSlot({
      slotId: DIAGNOSTIC_SLOT,
      label: 'M10d local diagnostic',
      data: { sequence: (current?.data.sequence ?? 0) + 1 },
      expectedRevision: current?.metadata.revision ?? 0,
    })
    const loaded = await storage.readSlot<{ sequence: number }>(DIAGNOSTIC_SLOT)
    if (
      loaded?.metadata.revision !== written.metadata.revision
      || loaded.data.sequence !== written.data.sequence
    ) {
      throw new Error('Local save roundtrip returned different data')
    }
    host.dataset.storageRoundtrip = 'true'
    host.dataset.storageRevision = String(loaded.metadata.revision)
    host.dataset.storageSequence = String(loaded.data.sequence)
    status.textContent =
      `Local save roundtrip revision ${loaded.metadata.revision} succeeded`
  }

  const proveConflict = async (): Promise<void> => {
    let current = await storage.readSlot<{ sequence: number }>(DIAGNOSTIC_SLOT)
    if (current === undefined) {
      await roundtrip()
      current = await storage.readSlot<{ sequence: number }>(DIAGNOSTIC_SLOT)
    }
    if (current === undefined) throw new Error('Diagnostic slot is missing')
    try {
      await storage.writeSlot({
        slotId: DIAGNOSTIC_SLOT,
        label: 'Stale diagnostic write',
        data: { sequence: current.data.sequence + 1 },
        expectedRevision: Math.max(0, current.metadata.revision - 1),
      })
      throw new Error('Stale diagnostic write unexpectedly succeeded')
    } catch (error) {
      if (!(error instanceof SaveStorageConflictError)) throw error
    }
    const retained = await storage.readSlot<{ sequence: number }>(DIAGNOSTIC_SLOT)
    if (
      retained?.metadata.revision !== current.metadata.revision
      || retained.data.sequence !== current.data.sequence
    ) {
      throw new Error('Stale conflict changed the current local save')
    }
    host.dataset.storageConflict = 'true'
    host.dataset.storageRevision = String(retained.metadata.revision)
    host.dataset.storageSequence = String(retained.data.sequence)
    status.textContent =
      `Stale revision rejected; local save remains at revision `
      + `${retained.metadata.revision} with sequence ${retained.data.sequence}`
  }

  const run = (operation: () => Promise<void>): void => {
    void operation().catch((error) => {
      if (destroyed) return
      host.dataset.storageError = 'true'
      status.textContent = error instanceof Error ? error.message : String(error)
    })
  }

  host
    .querySelector<HTMLButtonElement>('[data-storage-action="roundtrip"]')!
    .addEventListener('click', () => run(roundtrip))
  host
    .querySelector<HTMLButtonElement>('[data-storage-action="conflict"]')!
    .addEventListener('click', () => run(proveConflict))
  host
    .querySelector<HTMLButtonElement>('[data-storage-action="estimate"]')!
    .addEventListener('click', () => run(refreshEstimate))

  const unsubscribe = platform.subscribeLifecycle(renderLifecycle)
  const ready = (async () => {
    renderCapabilities(await platform.queryCapabilities())
    platform.start()
    renderLifecycle(platform.getLifecycleState())
    await refreshEstimate()
  })()

  return {
    ready,
    destroy() {
      if (destroyed) return
      destroyed = true
      unsubscribe()
      platform.stop()
      host.replaceChildren()
    },
  }
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

function formatBytes(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} B`
}
