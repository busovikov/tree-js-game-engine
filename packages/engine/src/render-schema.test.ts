import { describe, expect, it } from 'vitest'
import {
  EDITOR_LIGHT_GIZMO_MAX_DISTANCE,
  LightSchema,
  MeshMaterialSchema,
  MeshRendererSchema,
  lightDisplayDistance,
  normalizeMeshMaterial,
  normalizeMeshRenderer,
} from './index.js'

describe('render-owned schemas', () => {
  it('normalizes legacy material and mesh data', () => {
    const material = normalizeMeshMaterial({
      color: '#ff0000',
      metalness: 0.5,
      roughness: 0.25,
    })
    expect(material).toMatchObject({
      materialType: 'standard',
      color: '#ff0000',
      metalness: 0.5,
      roughness: 0.25,
    })

    const renderer = normalizeMeshRenderer({
      geometryType: 'BoxGeometry',
      geometryParams: {},
      material: { color: '#112233' },
    })
    expect(renderer.material).toMatchObject({
      materialType: 'standard',
      color: '#112233',
    })
  })

  it('parses material and mesh defaults', () => {
    const material = MeshMaterialSchema.parse({ materialType: 'standard' })
    expect(material).toMatchObject({ materialType: 'standard', color: '#6699ff' })
    expect(MeshRendererSchema.parse({}).material.materialType).toBe('standard')
  })

  it('caps editor light gizmo distance', () => {
    expect(
      lightDisplayDistance(LightSchema.parse({
        type: 'spot',
        color: '#ffffff',
        intensity: 1,
        distance: 100,
        decay: 1,
        outerAngle: 30,
        innerAngle: 10,
        localPosition: [0, 0, 0],
        targetPosition: [0, 0, -1],
        castShadow: false,
        enabled: true,
      })),
    ).toBe(EDITOR_LIGHT_GIZMO_MAX_DISTANCE)
    expect(
      lightDisplayDistance(LightSchema.parse({
        type: 'directional',
        color: '#ffffff',
        intensity: 1,
        localPosition: [0, 0, 0],
        targetPosition: [0, 0, -1],
        castShadow: false,
        enabled: true,
      })),
    ).toBe(2)
  })
})
