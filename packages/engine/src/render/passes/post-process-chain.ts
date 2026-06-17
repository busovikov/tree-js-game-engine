import type { RenderSettings } from '@haku/schema'
import { isFeatureActive } from '@haku/schema'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js'
import * as THREE from 'three'
import type { RenderContext, RenderPass as HakuRenderPass } from '../render-pass.js'

export class PostProcessChain implements HakuRenderPass {
  readonly id = 'post-process'
  readonly order = 200
  readonly featureKey = 'postProcessing' as const

  private composer: EffectComposer | null = null
  private renderTarget: THREE.WebGLRenderTarget | null = null
  private settings: RenderSettings
  private width = 1
  private height = 1

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    settings?: RenderSettings,
  ) {
    this.settings = settings ?? { features: { postProcessing: false } } as RenderSettings
  }

  setSettings(settings: RenderSettings): void {
    const wasEnabled = this.enabled(this.settings)
    this.settings = settings
    const nowEnabled = this.enabled(settings)
    if (wasEnabled && !nowEnabled) {
      this.disposeComposer()
    }
  }

  enabled(settings: RenderSettings): boolean {
    return isFeatureActive(settings, 'postProcessing') && settings.postProcessing.enabled
  }

  isFxaaEnabled(settings: RenderSettings): boolean {
    return this.enabled(settings) && isFeatureActive(settings, 'fxaa')
  }

  isBloomEnabled(settings: RenderSettings): boolean {
    return this.enabled(settings) && isFeatureActive(settings, 'bloom')
  }

  isVignetteEnabled(settings: RenderSettings): boolean {
    return this.enabled(settings) && isFeatureActive(settings, 'vignette')
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
    const pixelRatio = this.renderer.getPixelRatio()
    const bufferWidth = Math.max(1, Math.round(width * pixelRatio))
    const bufferHeight = Math.max(1, Math.round(height * pixelRatio))
    this.composer?.setSize(bufferWidth, bufferHeight)
    this.renderTarget?.setSize(bufferWidth, bufferHeight)
  }

  render(): void {
    // Orchestrated by RenderGraph via renderToTarget / renderFromTarget
  }

  renderToTarget(ctx: RenderContext, scene: THREE.Scene, camera: THREE.Camera): void {
    this.ensureComposer(scene, camera)
    if (!this.renderTarget) {
      const pixelRatio = ctx.renderer.getPixelRatio()
      const w = Math.max(1, Math.round(ctx.width * pixelRatio))
      const h = Math.max(1, Math.round(ctx.height * pixelRatio))
      this.renderTarget = new THREE.WebGLRenderTarget(w, h)
    }
    ctx.renderer.setRenderTarget(this.renderTarget)
    ctx.renderer.clear()
    ctx.renderer.render(scene, camera)
    ctx.renderer.setRenderTarget(null)
  }

  renderFromTarget(_ctx: RenderContext, scene: THREE.Scene, camera: THREE.Camera): void {
    this.ensureComposer(scene, camera)
    this.composer?.render()
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.composer) return

    const pixelRatio = this.renderer.getPixelRatio()
    const w = Math.max(1, Math.round(this.width * pixelRatio))
    const h = Math.max(1, Math.round(this.height * pixelRatio))

    this.composer = new EffectComposer(this.renderer)
    const renderPass = new RenderPass(scene, camera)
    this.composer.addPass(renderPass)

    if (this.isFxaaEnabled(this.settings)) {
      const fxaa = new ShaderPass(FXAAShader)
      const size = this.renderer.getSize(new THREE.Vector2())
      fxaa.material.uniforms.resolution.value.set(1 / size.x, 1 / size.y)
      this.composer.addPass(fxaa)
    }

    if (this.isBloomEnabled(this.settings)) {
      const bloomEffect = this.settings.postProcessing.effects.find((e) => e.type === 'bloom')
      const intensity = bloomEffect?.type === 'bloom' ? bloomEffect.intensity : 1
      const threshold = bloomEffect?.type === 'bloom' ? bloomEffect.threshold : 0.85
      const radius = bloomEffect?.type === 'bloom' ? bloomEffect.radius : 0.4
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), intensity, radius, threshold)
      this.composer.addPass(bloom)
    }

    if (this.isVignetteEnabled(this.settings)) {
      const vignetteEffect = this.settings.postProcessing.effects.find((e) => e.type === 'vignette')
      const vignette = new ShaderPass(VignetteShader)
      if (vignetteEffect?.type === 'vignette') {
        vignette.uniforms.offset.value = vignetteEffect.offset
        vignette.uniforms.darkness.value = vignetteEffect.darkness
      }
      this.composer.addPass(vignette)
    }
  }

  private disposeComposer(): void {
    this.composer?.dispose()
    this.composer = null
    this.renderTarget?.dispose()
    this.renderTarget = null
  }

  dispose(): void {
    this.disposeComposer()
  }
}
