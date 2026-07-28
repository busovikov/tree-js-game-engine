import { describe, expect, it, vi } from 'vitest'
import { openProjectInExternalVsCode } from './external-vscode.js'

describe('external VS Code workflow', () => {
  it('opens an absolute local project path through the VS Code protocol', () => {
    const open = vi.fn()

    const url = openProjectInExternalVsCode('/Users/developer/My Game', open)

    expect(url).toBe('vscode://file/Users/developer/My%20Game')
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer')
  })

  it('rejects folder names that cannot identify the disk project', () => {
    expect(() => openProjectInExternalVsCode('My Game', vi.fn())).toThrow(
      'An absolute project path is required to open external VS Code.',
    )
  })
})
