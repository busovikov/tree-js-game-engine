import { describe, expect, it } from 'vitest'
import {
  createPlatformGraphService,
  type PlatformAdapter,
} from './index.js'

describe('platform graph service adapter', () => {
  it('reports only capabilities returned by the public adapter', async () => {
    const adapter: PlatformAdapter = {
      queryCapabilities: async () => ({
        lifecycle: true,
        auth: false,
        pause: true,
        input: false,
        audio: true,
      }),
      getLifecycleState: () => ({
        visibility: 'visible',
        focus: 'focused',
        paused: false,
        pauseReasons: [],
      }),
      subscribeLifecycle: () => () => undefined,
      start: () => undefined,
      stop: () => undefined,
    }
    const service = createPlatformGraphService(adapter)

    await expect(service.hasCapability('audio')).resolves.toBe(true)
    await expect(service.hasCapability('auth')).resolves.toBe(false)
  })
})
