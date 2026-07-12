import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { defaultRenderSettings } from '@haku/schema'
import { RENDER_LAYER_DEFAULT, layerBit } from '@haku/schema'
import {
  applyLayerMask,
  resolveCameraLayerMask,
  resolveEntityLayerMask,
} from './layer-resolver.js'

describe('layer-resolver', () => {
  it('returns default layer when renderingLayers feature is off', () => {
    const settings = defaultRenderSettings()
    expect(resolveEntityLayerMask(layerBit(1), settings)).toBe(RENDER_LAYER_DEFAULT)
    expect(resolveCameraLayerMask(settings)).toBe(RENDER_LAYER_DEFAULT)
  })

  it('uses entity mask when renderingLayers feature is on', () => {
    const settings = {
      ...defaultRenderSettings(),
      features: { ...defaultRenderSettings().features, renderingLayers: true },
    }
    const mask = layerBit(3)
    expect(resolveEntityLayerMask(mask, settings)).toBe(mask)
    expect(resolveCameraLayerMask({ ...settings, defaultLayer: 2 })).toBe(layerBit(2))
  })

  it('applyLayerMask skips editor overlay descendants', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh()
    const overlay = new THREE.LineSegments()
    overlay.userData.hakuEditorOverlay = true
    overlay.layers.mask = layerBit(2)
    root.add(mesh)
    root.add(overlay)

    applyLayerMask(root, RENDER_LAYER_DEFAULT)

    expect(mesh.layers.mask).toBe(RENDER_LAYER_DEFAULT)
    expect(overlay.layers.mask).toBe(layerBit(2))
  })
})
