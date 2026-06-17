import { describe, expect, it } from 'vitest'
import { RenderTargetPool } from './render-target-pass.js'

describe('RenderTargetPool', () => {
  it('creates and disposes targets', () => {
    const pool = new RenderTargetPool()
    const rt = pool.getOrCreate('entity-1', 256, 256)
    expect(rt.width).toBe(256)
    expect(pool.size).toBe(1)
    pool.dispose('entity-1')
    expect(pool.size).toBe(0)
  })
})
