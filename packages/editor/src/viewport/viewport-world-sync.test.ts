import { describe, expect, it, vi } from 'vitest'
import { detachGizmoBeforeWorldSync } from './viewport-world-sync.js'

describe('viewport world sync', () => {
  it('detaches and hides the transform gizmo before scene objects are replaced', () => {
    const helper = { visible: true }
    const detach = vi.fn()

    detachGizmoBeforeWorldSync({
      detach,
      getHelper: () => helper,
    })

    expect(detach).toHaveBeenCalledOnce()
    expect(helper.visible).toBe(false)
  })

  it('allows world sync before the gizmo is initialized', () => {
    expect(() => detachGizmoBeforeWorldSync(null)).not.toThrow()
  })
})
