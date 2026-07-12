import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_ASSETS_DIR,
  EDITOR_LIGHT_GIZMO_MAX_DISTANCE,
  MeshMaterialSchema,
  MeshRendererSchema,
  lightDisplayDistance,
  normalizeMeshMaterial,
  normalizeMeshRenderer,
  projectPathToUrl,
  relativeToAssetsDir,
  validateSceneDocument,
} from '../src/index.js'

describe('@haku/schema', () => {
  it('validates minimal.scene.json', () => {
    const path = join(import.meta.dirname, '../../../examples/minimal.scene.json')
    const json = JSON.parse(readFileSync(path, 'utf-8'))
    const doc = validateSceneDocument(json)
    expect(doc.schemaVersion).toBe(1)
    expect(doc.entities).toHaveLength(3)
  })

  it('maps public assets to fetch URLs', () => {
    expect(projectPathToUrl('public/assets/scenes/menu.scene.json')).toBe('/assets/scenes/menu.scene.json')
    expect(DEFAULT_ASSETS_DIR).toBe('public/assets')
    expect(relativeToAssetsDir('public/assets/models/box.glb')).toBe('models/box.glb')
  })

  it('defaults materialType to standard for legacy material objects', () => {
    const material = normalizeMeshMaterial({
      color: '#ff0000',
      metalness: 0.5,
      roughness: 0.25,
    })
    expect(material.materialType).toBe('standard')
    expect(material.color).toBe('#ff0000')
    expect(material.metalness).toBe(0.5)
    expect(material.roughness).toBe(0.25)
  })

  it('parses MeshRenderer with legacy inline material', () => {
    const renderer = normalizeMeshRenderer({
      geometryType: 'BoxGeometry',
      geometryParams: {},
      material: { color: '#112233' },
    })
    expect(renderer.material.materialType).toBe('standard')
    expect(renderer.material.color).toBe('#112233')
  })

  it('accepts explicit standard materialType', () => {
    const parsed = MeshMaterialSchema.parse({ materialType: 'standard' })
    expect(parsed.materialType).toBe('standard')
    expect(parsed.color).toBe('#6699ff')
  })

  it('embeds material defaults on empty MeshRenderer', () => {
    const renderer = MeshRendererSchema.parse({})
    expect(renderer.material.materialType).toBe('standard')
  })

  it('caps editor light gizmo distance for large spot/point ranges', () => {
    expect(
      lightDisplayDistance({
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
      }),
    ).toBe(EDITOR_LIGHT_GIZMO_MAX_DISTANCE)
    expect(
      lightDisplayDistance({
        type: 'directional',
        color: '#ffffff',
        intensity: 1,
        localPosition: [0, 0, 0],
        targetPosition: [0, 0, -1],
        castShadow: false,
        enabled: true,
      }),
    ).toBe(2)
  })
})
