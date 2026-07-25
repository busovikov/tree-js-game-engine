import { describe, expect, it, vi } from 'vitest'
import { confirmDiscardChanges, prepareBeforeUnload } from './unsaved-changes.js'

describe('unsaved change guards', () => {
  it('asks before discarding a dirty scene', () => {
    const confirm = vi.fn(() => false)

    expect(confirmDiscardChanges(true, confirm)).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
    expect(confirmDiscardChanges(false, confirm)).toBe(true)
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('marks beforeunload as cancelable only while dirty', () => {
    const cleanEvent = { preventDefault: vi.fn(), returnValue: 'unchanged' }
    prepareBeforeUnload(cleanEvent, false)
    expect(cleanEvent.preventDefault).not.toHaveBeenCalled()
    expect(cleanEvent.returnValue).toBe('unchanged')

    const dirtyEvent = { preventDefault: vi.fn(), returnValue: 'unchanged' }
    prepareBeforeUnload(dirtyEvent, true)
    expect(dirtyEvent.preventDefault).toHaveBeenCalledOnce()
    expect(dirtyEvent.returnValue).toBe('')
  })
})
