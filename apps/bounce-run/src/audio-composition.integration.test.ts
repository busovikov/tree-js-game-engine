// @vitest-environment happy-dom

import {
  AUDIO_BUSES,
  AudioLifecycleError,
  type AudioBackend,
  type AudioBus,
  type AudioBusState,
  type AudioListenerPose,
  type AudioVoiceId,
  type AudioVoiceRequest,
  type AudioVoiceUpdate,
} from '@haku/audio'
import { EngineScheduler, World } from '@haku/core'
import { EntityPool, poolHandleRoot } from '@haku/pool'
import { InMemorySaveStorage } from '@haku/storage'
import { UIService } from '@haku/ui'
import { describe, expect, it, vi } from 'vitest'
import documentAsset from '../public/assets/ui/hud.ui.json'
import { BOUNCE_RUN_AUDIO_CLIPS, createBounceRunAudioComposition } from './audio-composition.js'
import { BOUNCE_RUN_UI_IDS, loadBounceRunUIDocument } from './ui-document.js'
import {
  createBounceRunUIGameplayAdapter,
  type BounceRunUIEventListener,
  type BounceRunUIRuntimeEvent,
} from './ui-gameplay-adapter.js'

class ControllableAudioBackend implements AudioBackend {
  readonly sequence: string[] = []
  readonly voices = new Map<AudioVoiceId, AudioVoiceRequest>()
  readonly busStates = new Map<AudioBus, AudioBusState>(
    AUDIO_BUSES.map((bus) => [bus, { volume: 1, muted: false }]),
  )
  unlockFailure: Error | null = null
  pauseFailure: Error | null = null
  resumeFailure: Error | null = null
  unlockCalls = 0
  pauseCalls = 0
  resumeCalls = 0
  private nextVoice = 1

  async unlock(): Promise<void> {
    this.sequence.push('unlock')
    this.unlockCalls += 1
    if (this.unlockFailure) {
      const failure = this.unlockFailure
      this.unlockFailure = null
      throw failure
    }
  }

  startVoice(request: AudioVoiceRequest): AudioVoiceId {
    const voice = `voice-${this.nextVoice++}`
    this.sequence.push(`play:${request.clipData.id}:${request.bus}`)
    this.voices.set(voice, request)
    return voice
  }

  updateVoice(_voiceId: AudioVoiceId, _update: AudioVoiceUpdate): void {}

  stopVoice(voiceId: AudioVoiceId): void {
    this.voices.delete(voiceId)
  }

  setBusState(bus: AudioBus, state: AudioBusState): void {
    this.busStates.set(bus, state)
  }

  setListenerPose(_pose: AudioListenerPose): void {}

  async setPaused(paused: boolean): Promise<void> {
    this.sequence.push(paused ? 'pause' : 'resume')
    if (paused) {
      this.pauseCalls += 1
      if (this.pauseFailure) {
        const failure = this.pauseFailure
        this.pauseFailure = null
        throw failure
      }
    } else {
      this.resumeCalls += 1
      if (this.resumeFailure) {
        const failure = this.resumeFailure
        this.resumeFailure = null
        throw failure
      }
    }
  }

  dispose(): void {
    this.voices.clear()
  }
}

async function mountComposition(backend = new ControllableAudioBackend()) {
  const host = document.createElement('div')
  const ui = new UIService()
  const uiDocument = await loadBounceRunUIDocument(async () => ({
    ok: true,
    json: async () => documentAsset,
  }))
  ui.register(uiDocument)
  const documentInstance = ui.mount(uiDocument.id, host)
  const gameplayUI = createBounceRunUIGameplayAdapter({
    ui,
    document: uiDocument,
    targets: {
      statusText: BOUNCE_RUN_UI_IDS.stateText,
      scoreText: BOUNCE_RUN_UI_IDS.scoreText,
      bestScoreText: BOUNCE_RUN_UI_IDS.highScoreText,
    },
  })
  const world = new World()
  const pool = new EntityPool({
    id: 'bounce-run-audio-owner-pool',
    world,
    capacity: 1,
    maximum: 1,
    expansionPolicy: 'fixed',
    createInstance: () => world.createEntity('Pooled audio owner'),
  })
  pool.prewarm()
  const composition = createBounceRunAudioComposition({
    scheduler: new EngineScheduler(),
    ui,
    storage: new InMemorySaveStorage(),
    backend,
    gameplayUI,
    pooledOwners: [pool],
  })
  await composition.initialize()
  return { backend, composition, documentInstance, gameplayUI, pool, ui }
}

function createControllableGameplayUI() {
  const listeners = new Set<BounceRunUIEventListener>()
  let disposed = false
  return {
    updateHud: vi.fn(),
    subscribe(listener: BounceRunUIEventListener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(event: BounceRunUIRuntimeEvent) {
      for (const listener of listeners) listener(event)
    },
    dispose() {
      disposed = true
      listeners.clear()
    },
    isDisposed: () => disposed,
  }
}

function click(
  instance: Awaited<ReturnType<typeof mountComposition>>['documentInstance'],
  id: string,
) {
  instance.getElement(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('Bounce Run production audio composition', () => {
  it('routes each named UI action once into the existing session and audio boundary', async () => {
    const host = document.createElement('div')
    const ui = new UIService()
    const uiDocument = await loadBounceRunUIDocument(async () => ({
      ok: true,
      json: async () => documentAsset,
    }))
    ui.register(uiDocument)
    ui.mount(uiDocument.id, host)
    const backend = new ControllableAudioBackend()
    const gameplayUI = createControllableGameplayUI()
    const composition = createBounceRunAudioComposition({
      scheduler: new EngineScheduler(),
      ui,
      storage: new InMemorySaveStorage(),
      backend,
      gameplayUI,
    })
    await composition.initialize()
    const emit = (
      bindingName: string,
      type: BounceRunUIRuntimeEvent['type'],
      value?: BounceRunUIRuntimeEvent['value'],
    ) =>
      gameplayUI.emit({
        documentId: uiDocument.id,
        elementId: BOUNCE_RUN_UI_IDS.startButton as BounceRunUIRuntimeEvent['elementId'],
        bindingId: BOUNCE_RUN_UI_IDS.events.start as BounceRunUIRuntimeEvent['bindingId'],
        bindingName,
        type,
        ...(value !== undefined ? { value } : {}),
      })

    emit('start-session', 'activate')
    await composition.settled()
    expect(backend.unlockCalls).toBe(1)
    expect(composition.session.state()).toBe('active')

    emit('set-master-volume', 'input', 0.35)
    emit('set-master-muted', 'change', true)
    expect(backend.busStates.get('master')).toEqual({ volume: 0.35, muted: true })

    composition.dispose()
    expect(gameplayUI.isDisposed()).toBe(true)
    emit('restart-session', 'activate')
    expect(composition.session.state()).toBe('active')
    ui.destroyAll()
  })

  it('unlocks in the Start activation before graph music/SFX and preserves authored settings', async () => {
    const mounted = await mountComposition()

    click(mounted.documentInstance, BOUNCE_RUN_UI_IDS.startButton)
    await mounted.composition.settled()

    expect(mounted.backend.sequence[0]).toBe('unlock')
    expect(mounted.composition.session.state()).toBe('active')
    expect(mounted.backend.voices.size).toBe(2)
    expect([...mounted.backend.voices.values()].filter((voice) => voice.loop)).toHaveLength(1)

    expect(mounted.composition.session.awardRouteProgress(1)).toBe(true)
    expect(mounted.composition.session.awardRouteProgress(1)).toBe(false)
    expect(mounted.composition.session.collectBonus()).toBe(true)
    await mounted.composition.fail()
    const emitted = mounted.backend.sequence.filter((entry) => entry.startsWith('play:'))
    expect(emitted.filter((entry) => entry.includes(BOUNCE_RUN_AUDIO_CLIPS.landing))).toHaveLength(
      1,
    )
    expect(emitted.filter((entry) => entry.includes(BOUNCE_RUN_AUDIO_CLIPS.bonus))).toHaveLength(1)
    expect(emitted.filter((entry) => entry.includes(BOUNCE_RUN_AUDIO_CLIPS.fail))).toHaveLength(1)

    await mounted.composition.restart()
    expect([...mounted.backend.voices.values()].filter((voice) => voice.loop)).toHaveLength(1)
    await mounted.composition.pause()
    await mounted.composition.pause()
    await mounted.composition.resume()
    await mounted.composition.resume()
    expect(mounted.backend.pauseCalls).toBe(1)
    expect(mounted.backend.resumeCalls).toBe(1)

    mounted.composition.setBusVolume('master', 0.8)
    mounted.composition.setBusVolume('music', 0.55)
    mounted.composition.setBusVolume('sfx', 0.65)
    mounted.composition.setBusVolume('ui', 0.75)
    mounted.composition.setBusMuted('music', true)
    mounted.composition.setBusMuted('music', false)
    click(mounted.documentInstance, BOUNCE_RUN_UI_IDS.masterAudioButton)
    click(mounted.documentInstance, BOUNCE_RUN_UI_IDS.masterAudioButton)
    expect(
      mounted.documentInstance.getElement(BOUNCE_RUN_UI_IDS.masterAudioButton)?.textContent,
    ).toBe('Master on')
    expect(mounted.backend.busStates).toEqual(
      new Map([
        ['master', { volume: 0.8, muted: false }],
        ['music', { volume: 0.55, muted: false }],
        ['sfx', { volume: 0.65, muted: false }],
        ['ui', { volume: 0.75, muted: false }],
      ]),
    )
    expect(() => mounted.composition.setBusVolume('sfx', Number.NaN)).toThrow(
      'Audio volume must be a finite number from 0 to 1',
    )

    mounted.composition.dispose()
    mounted.ui.destroyAll()
  })

  it('keeps failed activation and pause/resume retryable and cleans every pooled-owner voice', async () => {
    const backend = new ControllableAudioBackend()
    backend.unlockFailure = new Error('gesture rejected')
    const mounted = await mountComposition(backend)

    click(mounted.documentInstance, BOUNCE_RUN_UI_IDS.startButton)
    await expect(mounted.composition.settled()).rejects.toMatchObject({
      name: 'AudioLifecycleError',
      operation: 'unlock',
    } satisfies Partial<AudioLifecycleError>)
    expect(mounted.composition.session.state()).toBe('start')
    expect(backend.voices.size).toBe(0)

    click(mounted.documentInstance, BOUNCE_RUN_UI_IDS.startButton)
    await mounted.composition.settled()
    backend.pauseFailure = new Error('pause rejected')
    await expect(mounted.composition.pause()).rejects.toMatchObject({ operation: 'pause' })
    expect(mounted.composition.session.state()).toBe('active')
    await mounted.composition.pause()
    backend.resumeFailure = new Error('resume rejected')
    await expect(mounted.composition.resume()).rejects.toMatchObject({ operation: 'resume' })
    expect(mounted.composition.session.state()).toBe('paused')
    await mounted.composition.resume()

    const first = mounted.pool.acquire()!
    const firstOwner = poolHandleRoot(first).value
    mounted.composition.playOwnedBonus(firstOwner)
    mounted.composition.playOwnedBonus(firstOwner)
    expect(mounted.composition.inspect().activeVoices).toBeGreaterThanOrEqual(3)
    mounted.pool.release(first)
    expect(mounted.composition.inspect().ownedVoices(firstOwner)).toBe(0)

    const second = mounted.pool.acquire()!
    expect(second.entity).toBe(first.entity)
    mounted.composition.playOwnedBonus(poolHandleRoot(second).value)
    mounted.pool.release(second)
    expect(mounted.composition.inspect().ownedVoices(firstOwner)).toBe(0)
    expect(mounted.pool.metrics()).toMatchObject({ active: 0, inactive: 1 })

    mounted.composition.dispose()
    expect(mounted.composition.inspect().activeVoices).toBe(0)
    mounted.ui.destroyAll()
  })
})
