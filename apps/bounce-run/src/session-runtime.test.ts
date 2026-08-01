// @vitest-environment happy-dom

import { EngineScheduler } from '@haku/core'
import { UIService } from '@haku/ui'
import { describe, expect, it } from 'vitest'
import { createBounceRunSessionRuntime } from './session-runtime.js'
import documentAsset from '../public/assets/ui/hud.ui.json'
import { BOUNCE_RUN_UI_IDS, loadBounceRunUIDocument } from './ui-document.js'

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
    })

    session.initialize()
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
    session.fail()
    expect(session.state()).toBe('game-over')
    expect(documentInstance.getElement(BOUNCE_RUN_UI_IDS.gameOverPanel)?.hidden).toBe(false)

    session.restart()
    expect(session.state()).toBe('active')
    expect(session.score()).toBe(0)
    expect(documentInstance.getElement(BOUNCE_RUN_UI_IDS.gameOverPanel)?.hidden).toBe(true)
  })
})
