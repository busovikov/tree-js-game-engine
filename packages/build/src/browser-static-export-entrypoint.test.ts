import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('@haku/build browser static export entrypoint', () => {
  it('exposes the pure export helper without loading browser worker clients', () => {
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const packageJson = JSON.parse(
      readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
    ) as {
      exports?: Record<string, { types?: string; import?: string }>
    }

    expect(packageJson.exports?.['./browser-static-export']).toEqual({
      types: './dist/browser-static-export.d.ts',
      import: './dist/browser-static-export.js',
    })
  })
})
