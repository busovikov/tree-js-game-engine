import { describe, expect, it, vi } from 'vitest'

const adapterState = vi.hoisted(() => ({ evaluations: 0 }))

vi.mock('./monaco-code-editor.js', () => {
  adapterState.evaluations += 1
  return { default: () => null }
})

import {
  createLazyCodeEditorProvider,
  DefaultCodeEditorProvider,
  type CodeEditorProvider,
} from './code-editor-provider.js'

describe('code editor provider boundary', () => {
  it('keeps the default Monaco adapter lazy at module evaluation', () => {
    expect(DefaultCodeEditorProvider).toBeDefined()
    expect(adapterState.evaluations).toBe(0)
  })

  it('accepts a replaceable lazy provider loader without invoking it eagerly', () => {
    const replacement: CodeEditorProvider = () => null
    const loader = vi.fn(async () => ({ default: replacement }))

    const provider = createLazyCodeEditorProvider(loader)

    expect(provider).not.toBe(replacement)
    expect(loader).not.toHaveBeenCalled()
  })
})
