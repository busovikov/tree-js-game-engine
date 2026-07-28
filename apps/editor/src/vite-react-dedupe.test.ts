import { describe, expect, it } from 'vitest'
import config from '../vite.config.js'

describe('editor Vite React boundary', () => {
  it('deduplicates React for lazy editor adapters', () => {
    expect(typeof config).toBe('object')
    if (typeof config !== 'object' || config === null) return

    expect(config.resolve?.dedupe).toEqual(
      expect.arrayContaining(['react', 'react-dom']),
    )
  })
})
