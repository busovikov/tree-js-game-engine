import { EditorSelectionOutlinePass } from './passes/editor-selection-outline.js'
import { ForwardPass } from './passes/forward-pass.js'
import { PostProcessChain } from './passes/post-process-chain.js'
import { RenderTargetPass } from './passes/render-target-pass.js'
import type { RenderSettings } from '@haku/schema'
import type * as THREE from 'three'
import type { RenderContext, RenderPass } from './render-pass.js'

export interface RenderGraphOptions {
  editorOutline?: EditorSelectionOutlinePass
}

export class RenderGraph {
  private readonly passes: RenderPass[] = []
  private settings: RenderSettings
  private width = 1
  private height = 1
  private readonly editorOutline: EditorSelectionOutlinePass | undefined

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    settings: RenderSettings,
    options: RenderGraphOptions = {},
  ) {
    this.settings = settings
    this.editorOutline = options.editorOutline
    this.passes = [
      new RenderTargetPass(renderer),
      new ForwardPass(),
      new PostProcessChain(renderer),
    ]
    if (options.editorOutline) {
      this.passes.push(options.editorOutline)
    }
    this.passes.sort((a, b) => a.order - b.order)
  }

  private editorOutlineEnabled(): boolean {
    return (this.editorOutline?.enabled(this.settings) ?? false) === true
  }

  setSettings(settings: RenderSettings): void {
    this.settings = settings
    for (const pass of this.passes) {
      if (pass instanceof PostProcessChain) {
        pass.setSettings(settings)
      }
      if (pass instanceof RenderTargetPass) {
        pass.setSettings(settings)
      }
    }
  }

  getPass<T extends RenderPass>(id: string): T | undefined {
    return this.passes.find((p) => p.id === id) as T | undefined
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
    for (const pass of this.passes) {
      pass.resize(width, height)
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const ctx: RenderContext = {
      renderer: this.renderer,
      width: this.width,
      height: this.height,
      pixelRatio: this.renderer.getPixelRatio(),
    }

    const postChain = this.getPass<PostProcessChain>('post-process')
    const usePost = postChain?.enabled(this.settings) ?? false

    for (const pass of this.passes) {
      if (!pass.enabled(this.settings)) continue
      if (pass.id === 'editor-selection-outline' && !this.editorOutlineEnabled()) continue
      if (pass.id === 'forward' && usePost) {
        postChain?.renderToTarget(ctx, scene, camera)
        continue
      }
      if (pass.id === 'post-process' && usePost) {
        postChain?.renderFromTarget(ctx, scene, camera)
        continue
      }
      if (pass.id === 'post-process') continue
      pass.render(ctx, scene, camera)
    }
  }

  dispose(): void {
    for (const pass of this.passes) {
      pass.dispose()
    }
  }
}
