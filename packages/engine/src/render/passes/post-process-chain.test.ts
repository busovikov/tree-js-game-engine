import { describe, expect, it } from 'vitest'
import { RenderSettingsSchema } from '@haku/schema'
import { PostProcessChain } from './post-process-chain.js'

describe('PostProcessChain', () => {
  it('enabled() is false when features.postProcessing is off', () => {
    const chain = new PostProcessChain({} as never)
    const settings = RenderSettingsSchema.parse({})
    expect(chain.enabled(settings)).toBe(false)
  })

  it('enabled() is true when postProcessing feature and profile enabled', () => {
    const chain = new PostProcessChain({} as never)
    const settings = RenderSettingsSchema.parse({
      features: { postProcessing: true },
      postProcessing: { enabled: true },
    })
    expect(chain.enabled(settings)).toBe(true)
  })

  it('per-effect flags require postProcessing parent', () => {
    const chain = new PostProcessChain({} as never)
    const settings = RenderSettingsSchema.parse({
      features: { bloom: true },
      postProcessing: { enabled: true },
    })
    expect(chain.isBloomEnabled(settings)).toBe(false)
  })
})
