import {
  RENDER_LAYER_DEFAULT,
  RENDER_LAYER_PICKING,
  type RenderSettings,
  isFeatureActive,
  layerBit,
} from '@haku/schema'
import type * as THREE from 'three'

export { RENDER_LAYER_DEFAULT, RENDER_LAYER_PICKING } from '@haku/schema'

export function resolveEntityLayerMask(
  renderingLayersMask: number | undefined,
  settings: RenderSettings,
): number {
  if (!isFeatureActive(settings, 'renderingLayers')) {
    return RENDER_LAYER_DEFAULT
  }
  return renderingLayersMask ?? RENDER_LAYER_DEFAULT
}

export function applyLayerMask(object: THREE.Object3D, mask: number): void {
  object.layers.mask = mask
  object.traverse((child) => {
    if (child.userData.hakuEditorOverlay) return
    child.layers.mask = mask
  })
}

export function resolveCameraLayerMask(settings: RenderSettings): number {
  if (!isFeatureActive(settings, 'renderingLayers')) {
    return RENDER_LAYER_DEFAULT
  }
  return layerBit(settings.defaultLayer)
}

export function pickingCameraLayerMask(): number {
  return RENDER_LAYER_PICKING
}
