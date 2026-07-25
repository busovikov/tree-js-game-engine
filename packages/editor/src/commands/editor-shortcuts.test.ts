import { describe, expect, it, vi } from 'vitest'
import { handleSaveShortcut } from './editor-shortcuts.js'

describe('editor save shortcut', () => {
  it('handles Cmd/Ctrl+S only when saving is available', () => {
    const save = vi.fn()
    const preventDefault = vi.fn()
    const event = {
      key: 's',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      repeat: false,
      preventDefault,
    }

    expect(handleSaveShortcut(event, true, save)).toBe(true)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledOnce()

    expect(handleSaveShortcut(event, false, save)).toBe(false)
    expect(save).toHaveBeenCalledOnce()
  })
})
