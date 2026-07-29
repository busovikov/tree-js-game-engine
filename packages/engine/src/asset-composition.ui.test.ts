import { describe, expect, it } from 'vitest'
import { UI_DOCUMENT_ASSET_TYPE } from '@haku/ui'
import { createEngineAssetRegistry } from './asset-registry.js'

describe('engine UI asset composition', () => {
  it('registers UI documents at the production composition root', () => {
    expect(createEngineAssetRegistry().require(UI_DOCUMENT_ASSET_TYPE).name).toBe('UI Document')
  })
})
