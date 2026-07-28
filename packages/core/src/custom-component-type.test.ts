import { describe, expect, it } from 'vitest'
import {
  CustomComponentTypeAssetSchema,
  createCustomComponentDefinition,
} from './custom-component-type.js'

const speedTypeAsset = {
  schemaVersion: 1,
  id: '42000000-0000-4000-8000-000000000001',
  name: 'Movement',
  version: 1,
  fields: [
    {
      name: 'speed',
      type: 'number',
      default: 6,
    },
  ],
} as const

describe('custom component type assets', () => {
  it('compiles a visual asset into a deterministic registry definition', () => {
    const asset = CustomComponentTypeAssetSchema.parse(speedTypeAsset)
    const first = createCustomComponentDefinition(asset)
    const second = createCustomComponentDefinition(
      CustomComponentTypeAssetSchema.parse(speedTypeAsset),
    )

    expect(first.id).toBe(speedTypeAsset.id)
    expect(first.name).toBe(speedTypeAsset.name)
    expect(first.version).toBe(speedTypeAsset.version)
    expect(first.defaults?.()).toEqual({ speed: 6 })
    expect(first.schema.parse({})).toEqual({ speed: 6 })
    expect(first.schema.parse({ speed: 9 })).toEqual({ speed: 9 })
    expect(() => first.schema.parse({ speed: 'fast' })).toThrow()
    expect(JSON.parse(JSON.stringify(first.defaults?.()))).toEqual({ speed: 6 })
    expect(first.fingerprint).toBe(second.fingerprint)
    expect(first.fingerprint).toMatch(/^haku-component-v1-/)
  })
})
