import { describe, expect, it } from 'vitest'
import {
  browserSafeRuntimeModule,
  resolveBrowserProjectImport,
} from './browser-bundle.js'

describe('browser project bundle resolver', () => {
  it('resolves only project-local relative modules', () => {
    expect(resolveBrowserProjectImport('./shared.js', 'src/gameplay.ts')).toBe('src/shared.ts')
    expect(resolveBrowserProjectImport('../config', 'src/nodes/jump.ts')).toBe('src/config.ts')
  })

  it('rejects remote URLs, path traversal, and arbitrary packages', () => {
    expect(() => resolveBrowserProjectImport('https://example.com/code.js', 'src/gameplay.ts')).toThrow(
      'Remote URL imports are not allowed',
    )
    expect(() => resolveBrowserProjectImport('../../outside', 'src/gameplay.ts')).toThrow(
      'Import escapes the project boundary',
    )
    expect(() => resolveBrowserProjectImport('left-pad', 'src/gameplay.ts')).toThrow(
      'Package import "left-pad" is not available',
    )
  })

  it('leaves public Haku APIs as explicit runtime imports', () => {
    expect(resolveBrowserProjectImport('@haku/core', 'src/gameplay.ts')).toBe('@haku/core')
  })

  it('provides the Custom Node SDK as a browser-safe local runtime module', () => {
    expect(browserSafeRuntimeModule('@haku/node-sdk')).toContain(
      'export const defineCustomNode',
    )
    expect(browserSafeRuntimeModule('@haku/core')).toBeNull()
  })
})
