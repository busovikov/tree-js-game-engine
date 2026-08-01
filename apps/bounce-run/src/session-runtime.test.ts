// @vitest-environment happy-dom

import { EngineScheduler } from '@haku/core'
import {
  InMemorySaveStorage,
  SaveStorageConflictError,
  SaveStorageOperationError,
  SaveStorageQuotaError,
  type ISaveStorage,
} from '@haku/storage'
import { UIService } from '@haku/ui'
import { describe, expect, it } from 'vitest'
import { createBounceRunSessionRuntime } from './session-runtime.js'
import documentAsset from '../public/assets/ui/hud.ui.json'
import { BOUNCE_RUN_UI_IDS, loadBounceRunUIDocument } from './ui-document.js'

const SCORE_TEXT_ID = 'b1200000-0000-4000-8000-000000000016'
const HIGH_SCORE_TEXT_ID = 'b1200000-0000-4000-8000-000000000017'
const HIGH_SCORE_SLOT_ID = 'bounce-run.high-score.v1'

function withRejectedWrites(storage: ISaveStorage, error: Error, attempts: number[]): ISaveStorage {
  return {
    writeSlot: async () => {
      attempts.push(1)
      throw error
    },
    readSlot: storage.readSlot.bind(storage),
    listSlots: storage.listSlots.bind(storage),
    writeReplayArtifact: storage.writeReplayArtifact.bind(storage),
    readReplayArtifact: storage.readReplayArtifact.bind(storage),
    listReplayArtifacts: storage.listReplayArtifacts.bind(storage),
    estimate: storage.estimate.bind(storage),
  }
}

async function mountSession(storage: ISaveStorage) {
  const host = document.createElement('div')
  const ui = new UIService()
  const uiDocument = await loadBounceRunUIDocument(async () => ({
    ok: true,
    json: async () => documentAsset,
  }))
  ui.register(uiDocument)
  const documentInstance = ui.mount(uiDocument.id, host)
  const session = createBounceRunSessionRuntime({
    scheduler: new EngineScheduler(),
    ui,
    storage,
  })
  await session.initialize()
  return { documentInstance, session, ui }
}

describe('Bounce Run session runtime', () => {
  it('executes start, pause, fail, and restart UI transitions through the graph', async () => {
    const host = document.createElement('div')
    const ui = new UIService()
    const uiDocument = await loadBounceRunUIDocument(async () => ({
      ok: true,
      json: async () => documentAsset,
    }))
    ui.register(uiDocument)
    const documentInstance = ui.mount(uiDocument.id, host)
    const session = createBounceRunSessionRuntime({
      scheduler: new EngineScheduler(),
      ui,
      storage: new InMemorySaveStorage(),
    })

    await session.initialize()
    expect(session.state()).toBe('start')
    expect(documentInstance.getElement(BOUNCE_RUN_UI_IDS.startPanel)?.hidden).toBe(false)

    session.start()
    expect(session.state()).toBe('active')
    expect(session.score()).toBe(0)
    expect(session.collectBonus()).toBe(true)
    expect(session.score()).toBe(1)
    expect(documentInstance.getElement(BOUNCE_RUN_UI_IDS.hudPanel)?.hidden).toBe(false)

    session.pause()
    expect(session.state()).toBe('paused')
    expect(session.collectBonus()).toBe(false)
    expect(session.score()).toBe(1)
    expect(documentInstance.getElement(BOUNCE_RUN_UI_IDS.pausePanel)?.hidden).toBe(false)

    session.resume()
    await session.fail()
    expect(session.state()).toBe('game-over')
    expect(documentInstance.getElement(BOUNCE_RUN_UI_IDS.gameOverPanel)?.hidden).toBe(false)

    session.restart()
    expect(session.state()).toBe('active')
    expect(session.score()).toBe(0)
    expect(documentInstance.getElement(BOUNCE_RUN_UI_IDS.gameOverPanel)?.hidden).toBe(true)
  })

  it('renders graph score and preserves a versioned local high score across loads and typed write failures', async () => {
    const storage = new InMemorySaveStorage({ now: () => '2026-08-01T00:00:00.000Z' })
    const first = await mountSession(storage)

    first.session.start()
    expect(first.documentInstance.getElement(SCORE_TEXT_ID)?.textContent).toBe('Score 0')
    expect(first.documentInstance.getElement(HIGH_SCORE_TEXT_ID)?.textContent).toBe('Best 0')
    expect(first.session.collectBonus()).toBe(true)
    expect(first.documentInstance.getElement(SCORE_TEXT_ID)?.textContent).toBe('Score 1')
    expect(first.session.collectBonus()).toBe(true)
    await first.session.fail()

    expect(first.documentInstance.getElement(HIGH_SCORE_TEXT_ID)?.textContent).toBe('Best 2')
    expect(await storage.readSlot(HIGH_SCORE_SLOT_ID)).toMatchObject({
      metadata: { revision: 1 },
      data: { schemaVersion: 1, highScore: 2 },
    })
    first.session.destroy()
    first.ui.destroyAll()

    const second = await mountSession(storage)
    expect(second.documentInstance.getElement(HIGH_SCORE_TEXT_ID)?.textContent).toBe('Best 2')
    second.session.start()
    expect(second.session.collectBonus()).toBe(true)
    expect(second.documentInstance.getElement(SCORE_TEXT_ID)?.textContent).toBe('Score 1')
    second.session.restart()
    expect(second.documentInstance.getElement(SCORE_TEXT_ID)?.textContent).toBe('Score 0')
    expect(second.documentInstance.getElement(HIGH_SCORE_TEXT_ID)?.textContent).toBe('Best 2')
    expect(second.session.collectBonus()).toBe(true)
    await second.session.fail()
    expect((await storage.readSlot(HIGH_SCORE_SLOT_ID))?.metadata.revision).toBe(1)
    second.session.destroy()
    second.ui.destroyAll()

    const failures = [
      new SaveStorageQuotaError(100, 100, 101),
      new SaveStorageConflictError(HIGH_SCORE_SLOT_ID, 1, 2),
      new SaveStorageOperationError(new Error('rejected write')),
    ]
    for (const failure of failures) {
      const attempts: number[] = []
      const mounted = await mountSession(withRejectedWrites(storage, failure, attempts))
      mounted.session.start()
      mounted.session.collectBonus()
      mounted.session.collectBonus()
      mounted.session.collectBonus()

      await expect(mounted.session.fail()).rejects.toBeInstanceOf(failure.constructor)
      expect(mounted.session.state()).toBe('game-over')
      expect(mounted.session.highScore()).toBe(2)
      expect(mounted.documentInstance.getElement(HIGH_SCORE_TEXT_ID)?.textContent).toBe('Best 2')
      expect(await storage.readSlot(HIGH_SCORE_SLOT_ID)).toMatchObject({
        metadata: { revision: 1 },
        data: { schemaVersion: 1, highScore: 2 },
      })
      expect(attempts.length).toBeLessThanOrEqual(
        failure instanceof SaveStorageConflictError ? 2 : 1,
      )
      mounted.session.destroy()
      mounted.ui.destroyAll()
    }

    const malformedStorage = new InMemorySaveStorage()
    await malformedStorage.writeSlot({
      slotId: HIGH_SCORE_SLOT_ID,
      label: 'Malformed Bounce Run high score',
      data: { schemaVersion: 1, highScore: 'not-a-number' },
      expectedRevision: 0,
    })
    const malformed = await mountSession(malformedStorage)
    expect(malformed.session.highScore()).toBe(0)
    expect(malformed.documentInstance.getElement(HIGH_SCORE_TEXT_ID)?.textContent).toBe('Best 0')
    malformed.session.destroy()
    malformed.ui.destroyAll()
  })
})
