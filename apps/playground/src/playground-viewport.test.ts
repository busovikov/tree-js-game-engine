import { describe, expect, it, vi } from 'vitest'
import { configurePlaygroundViewport } from './playground-viewport.js'

describe('standalone playground viewport', () => {
  it('uses the scene camera and keeps the renderer matched to the canvas', () => {
    const resize = vi.fn()
    const setViewportMode = vi.fn()
    const listeners = new Map<string, () => void>()
    const removeEventListener = vi.fn()
    const dispose = configurePlaygroundViewport(
      {
        backend: { setViewportMode, resize },
      },
      { clientWidth: 1280, clientHeight: 720 },
      {
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener,
      },
    )

    expect(setViewportMode).toHaveBeenCalledWith('view')
    expect(resize).toHaveBeenCalledWith(1280, 720)

    listeners.get('resize')?.()
    expect(resize).toHaveBeenCalledTimes(2)

    dispose()
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
