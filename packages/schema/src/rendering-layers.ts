import { z } from 'zod'

/** Layer 0 — default world geometry */
export const RENDER_LAYER_DEFAULT = 1 << 0
/** Layer 1 — transparent / overlay split */
export const RENDER_LAYER_TRANSPARENT = 1 << 1
/** Layer 2 — editor gizmos */
export const RENDER_LAYER_EDITOR_GIZMO = 1 << 2
/** Layer 30 — editor picking only */
export const RENDER_LAYER_PICKING = 1 << 30
/** Layer 31 — debug visualization */
export const RENDER_LAYER_DEBUG = 1 << 31

export const RenderingLayersSchema = z.object({
  mask: z.number().int().min(0).default(RENDER_LAYER_DEFAULT),
})
export type RenderingLayers = z.infer<typeof RenderingLayersSchema>

export function layerBit(index: number): number {
  if (index < 0 || index > 31) throw new RangeError(`Layer index must be 0–31, got ${index}`)
  return 1 << index
}

export function hasLayer(mask: number, layer: number): boolean {
  return (mask & layer) !== 0
}

export function defaultCameraLayerMask(defaultLayer: number): number {
  return layerBit(defaultLayer)
}
