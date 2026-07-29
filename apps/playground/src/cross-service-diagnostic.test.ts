/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { createCrossServiceDiagnostic } from './cross-service-diagnostic.js'

describe('M10f combined playground diagnostic', () => {
  it('proves graph effects, save persistence, pool reuse, UI, audio, platform, and export', async () => {
    const host = document.createElement('section')
    const diagnostic = createCrossServiceDiagnostic(host, {
      createAudioDiagnostic(audioHost) {
        audioHost.dataset.audioUnlocked = 'test'
        return { setPaused: async () => {}, destroy: () => {} }
      },
    })

    await diagnostic.runGraph()
    await diagnostic.runExport()

    expect(host.dataset.graphStatus).toBe('passed')
    expect(host.dataset.graphEffects).toBe(
      'audio.set-bus-volume,pool.acquire,pool.release,random.seeded,storage.write,ui.set-text',
    )
    expect(host.dataset.graphTrace).toContain('node-complete')
    expect(host.dataset.savePersisted).toBe('true')
    expect(host.dataset.poolReused).toBe('true')
    expect(host.dataset.platformAudio).toBe('true')
    expect(host.dataset.staticExport).toBe(
      'assets/m10f-ready.txt,assets/runtime.js,index.html',
    )
    expect(host.textContent).toContain('M10f graph services passed')

    diagnostic.destroy()
    expect(host.childElementCount).toBe(0)
  })

  it('renders a visible failure instead of claiming a partial pass', async () => {
    const host = document.createElement('section')
    const diagnostic = createCrossServiceDiagnostic(host, {
      createAudioDiagnostic() {
        return { setPaused: async () => {}, destroy: () => {} }
      },
      runStaticExport: async () => {
        throw new Error('bounded export failed')
      },
    })

    await expect(diagnostic.runExport()).rejects.toThrow(
      'bounded export failed',
    )
    expect(host.dataset.staticExport).toBe('failed')
    expect(host.textContent).toContain('bounded export failed')
    diagnostic.destroy()
  })
})
