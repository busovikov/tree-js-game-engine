import { describe, expect, it } from 'vitest'
import { EntityPoolComponent } from '@haku/pool'
import { createEngineComponentRegistry } from './components.js'

describe('engine pool component composition', () => {
  it('registers the serializable EntityPool component in runtime worlds', () => {
    expect(
      createEngineComponentRegistry().require(EntityPoolComponent.id),
    ).toBe(EntityPoolComponent)
  })
})
