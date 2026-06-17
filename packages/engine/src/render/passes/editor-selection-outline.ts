import type { RenderSettings } from '@haku/schema'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import * as THREE from 'three'
import type { RenderContext, RenderPass } from '../render-pass.js'

export class EditorSelectionOutlinePass implements RenderPass {
  readonly id = 'editor-selection-outline'
  readonly order = 300

  private outlinePass: OutlinePass | null = null
  private scratchBuffer: THREE.WebGLRenderTarget | null = null
  private targets: THREE.Object3D[] = []

  constructor(
    private readonly scene: THREE.Scene,
    _getActiveCamera: () => THREE.Camera,
  ) {}

  setTargets(targets: readonly THREE.Object3D[]): void {
    this.targets = [...targets]
    if (this.outlinePass) {
      this.outlinePass.selectedObjects = this.targets
    }
  }

  enabled(_settings: RenderSettings): boolean {
    return this.targets.length > 0
  }

  resize(width: number, height: number): void {
    this.outlinePass?.resolution.set(width, height)
  }

  setBufferSize(bufferWidth: number, bufferHeight: number, displayWidth: number, displayHeight: number): void {
    this.outlinePass?.setSize(bufferWidth, bufferHeight)
    this.outlinePass?.resolution.set(displayWidth, displayHeight)
    this.scratchBuffer?.setSize(bufferWidth, bufferHeight)
  }

  render(ctx: RenderContext, _scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.targets.length === 0) return

    this.ensurePass(ctx, camera)
    const pass = this.outlinePass!
    const scratch = this.scratchBuffer!

    pass.selectedObjects = this.targets
    pass.renderCamera = camera
    pass.renderToScreen = false
    pass.render(ctx.renderer, scratch, scratch, 0, false)

    const oldAutoClear = ctx.renderer.autoClear
    ctx.renderer.autoClear = false
    ctx.renderer.setRenderTarget(null)
    pass.fsQuad.material = pass.overlayMaterial
    pass.fsQuad.render(ctx.renderer)
    ctx.renderer.autoClear = oldAutoClear
  }

  private ensurePass(ctx: RenderContext, camera: THREE.Camera): void {
    if (this.outlinePass) {
      this.outlinePass.renderCamera = camera
      return
    }

    const pixelRatio = ctx.renderer.getPixelRatio()
    const width = Math.max(1, Math.round(ctx.width * pixelRatio))
    const height = Math.max(1, Math.round(ctx.height * pixelRatio))

    this.outlinePass = new OutlinePass(new THREE.Vector2(width, height), this.scene, camera)
    this.outlinePass.edgeStrength = 3
    this.outlinePass.edgeGlow = 0
    this.outlinePass.edgeThickness = 1.5
    this.outlinePass.pulsePeriod = 0
    this.outlinePass.visibleEdgeColor.set(0xffc107)
    this.outlinePass.hiddenEdgeColor.set(0xb38600)

    this.scratchBuffer = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.UnsignedByteType,
    })
  }

  dispose(): void {
    this.outlinePass?.dispose()
    this.outlinePass = null
    this.scratchBuffer?.dispose()
    this.scratchBuffer = null
    this.targets = []
  }
}

export function editorOutlineEnabled(_settings: RenderSettings, targetCount: number): boolean {
  return targetCount > 0
}
