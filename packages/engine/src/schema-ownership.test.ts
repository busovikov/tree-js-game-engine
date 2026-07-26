import { describe, expect, it } from 'vitest'
import * as Schema from '@haku/schema'
import { ColliderSchema, RigidBodySchema } from '@haku/physics'
import { LightSchema, MeshRendererSchema } from './index.js'

describe('subsystem schema ownership', () => {
  it('exposes physics component schemas only from @haku/physics', () => {
    expect(ColliderSchema.parse({ shape: 'box' }).shape).toBe('box')
    expect(RigidBodySchema.parse({}).type).toBe('dynamic')
    expect(Schema).not.toHaveProperty('ColliderSchema')
    expect(Schema).not.toHaveProperty('RigidBodySchema')
  })

  it('exposes render component schemas only from @haku/engine', () => {
    expect(LightSchema.parse({ type: 'directional' }).type).toBe('directional')
    expect(MeshRendererSchema.parse({}).geometryType).toBe('BoxGeometry')
    expect(Schema).not.toHaveProperty('LightSchema')
    expect(Schema).not.toHaveProperty('MeshRendererSchema')
  })
})
