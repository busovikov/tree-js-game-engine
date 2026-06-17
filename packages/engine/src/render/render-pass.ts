import type { RenderSettings, RenderSettingsFeatures } from '@haku/schema'
import type * as THREE from 'three'

export interface RenderContext {
  renderer: THREE.WebGLRenderer
  width: number
  height: number
  pixelRatio: number
}

export interface RenderPass {
  readonly id: string
  readonly order: number
  readonly featureKey?: keyof RenderSettingsFeatures
  enabled(settings: RenderSettings): boolean
  resize(width: number, height: number): void
  render(ctx: RenderContext, scene: THREE.Scene, camera: THREE.Camera): void
  dispose(): void
}
