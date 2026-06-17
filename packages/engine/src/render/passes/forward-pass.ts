import type { RenderSettings } from '@haku/schema'
import type * as THREE from 'three'
import type { RenderContext, RenderPass } from '../render-pass.js'

export class ForwardPass implements RenderPass {
  readonly id = 'forward'
  readonly order = 100

  enabled(_settings: RenderSettings): boolean {
    return true
  }

  resize(): void {}

  render(ctx: RenderContext, scene: THREE.Scene, camera: THREE.Camera): void {
    ctx.renderer.autoClear = true
    ctx.renderer.setRenderTarget(null)
    ctx.renderer.render(scene, camera)
  }

  dispose(): void {}
}

export function forwardPassEnabled(_settings: RenderSettings): boolean {
  return true
}
