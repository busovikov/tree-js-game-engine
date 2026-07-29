import { describe, expect, it, vi } from 'vitest'
import {
  BrowserPlatformAdapter,
  type PlatformAdapter,
  type PlatformAuthProvider,
} from './index.js'

class FakeDocumentTarget extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible'
  focused = true

  hasFocus(): boolean {
    return this.focused
  }
}

describe('BrowserPlatformAdapter', () => {
  it('reports lifecycle/auth/pause/input/audio capabilities honestly', async () => {
    const auth: PlatformAuthProvider = {
      getState: async () => ({ status: 'anonymous' }),
      requestAuthorization: async () => ({ status: 'authorized', playerId: 'player-1' }),
    }
    const adapter: PlatformAdapter = new BrowserPlatformAdapter({
      documentTarget: new FakeDocumentTarget(),
      windowTarget: new EventTarget(),
      auth,
      controls: {
        setSimulationPaused: () => undefined,
        setInputEnabled: () => undefined,
      },
    })

    await expect(adapter.queryCapabilities()).resolves.toEqual({
      lifecycle: true,
      auth: true,
      pause: true,
      input: true,
      audio: false,
    })
    await expect(adapter.auth?.getState()).resolves.toEqual({
      status: 'anonymous',
    })
    await expect(adapter.auth?.requestAuthorization()).resolves.toEqual({
      status: 'authorized',
      playerId: 'player-1',
    })
  })

  it('pauses simulation/audio and disables input while the page is hidden', async () => {
    const documentTarget = new FakeDocumentTarget()
    const windowTarget = new EventTarget()
    const setSimulationPaused = vi.fn()
    const setInputEnabled = vi.fn()
    const setAudioPaused = vi.fn(async () => undefined)
    const adapter = new BrowserPlatformAdapter({
      documentTarget,
      windowTarget,
      controls: {
        setSimulationPaused,
        setInputEnabled,
        setAudioPaused,
      },
    })
    const states: unknown[] = []
    adapter.subscribeLifecycle((state) => states.push(state))
    adapter.start()

    documentTarget.visibilityState = 'hidden'
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    await adapter.settled()

    expect(adapter.getLifecycleState()).toEqual({
      visibility: 'hidden',
      focus: 'focused',
      paused: true,
      pauseReasons: ['visibility'],
    })
    expect(setSimulationPaused).toHaveBeenLastCalledWith(true)
    expect(setInputEnabled).toHaveBeenLastCalledWith(false)
    expect(setAudioPaused).toHaveBeenLastCalledWith(true)
    expect(states).toContainEqual(expect.objectContaining({ paused: true }))
  })

  it('treats focus loss as input state, not false page visibility', async () => {
    const documentTarget = new FakeDocumentTarget()
    const windowTarget = new EventTarget()
    const setSimulationPaused = vi.fn()
    const setInputEnabled = vi.fn()
    const adapter = new BrowserPlatformAdapter({
      documentTarget,
      windowTarget,
      controls: { setSimulationPaused, setInputEnabled },
    })
    adapter.start()
    await adapter.settled()
    setSimulationPaused.mockClear()

    documentTarget.focused = false
    windowTarget.dispatchEvent(new Event('blur'))
    await adapter.settled()

    expect(adapter.getLifecycleState()).toEqual({
      visibility: 'visible',
      focus: 'blurred',
      paused: false,
      pauseReasons: [],
    })
    expect(setSimulationPaused).not.toHaveBeenCalled()
    expect(setInputEnabled).toHaveBeenLastCalledWith(false)
  })

  it('composes platform pauses with visibility and releases controls on stop', async () => {
    const documentTarget = new FakeDocumentTarget()
    const setSimulationPaused = vi.fn()
    const setInputEnabled = vi.fn()
    const setAudioPaused = vi.fn()
    const adapter = new BrowserPlatformAdapter({
      documentTarget,
      windowTarget: new EventTarget(),
      controls: {
        setSimulationPaused,
        setInputEnabled,
        setAudioPaused,
      },
    })
    adapter.start()

    adapter.setPlatformPaused('advertisement', true)
    await adapter.settled()
    expect(adapter.getLifecycleState().pauseReasons).toEqual([
      'platform:advertisement',
    ])

    adapter.stop()
    await adapter.settled()
    expect(setSimulationPaused).toHaveBeenLastCalledWith(false)
    expect(setInputEnabled).toHaveBeenLastCalledWith(true)
    expect(setAudioPaused).toHaveBeenLastCalledWith(false)
  })
})
