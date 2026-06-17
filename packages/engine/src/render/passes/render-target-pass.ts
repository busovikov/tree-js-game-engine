import type { RenderSettings } from '@haku/schema'
import { isFeatureActive } from '@haku/schema'
import * as THREE from 'three'
import type { RenderContext, RenderPass } from '../render-pass.js'

export class RenderTargetPool {
  private readonly targets = new Map<string, THREE.WebGLRenderTarget>()

  getOrCreate(id: string, width: number, height: number): THREE.WebGLRenderTarget {
    let rt = this.targets.get(id)
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(width, height)
      this.targets.set(id, rt)
    } else if (rt.width !== width || rt.height !== height) {
      rt.setSize(width, height)
    }
    return rt
  }

  getTexture(id: string): THREE.Texture | undefined {
    return this.targets.get(id)?.texture
  }

  dispose(id: string): void {
    const rt = this.targets.get(id)
    rt?.dispose()
    this.targets.delete(id)
  }

  disposeAll(): void {
    for (const rt of this.targets.values()) {
      rt.dispose()
    }
    this.targets.clear()
  }

  get size(): number {
    return this.targets.size
  }
}

export interface RenderTargetEntry {
  entityId: string
  camera: THREE.Camera
  width: number
  height: number
  updateMode: 'always' | 'on-demand' | 'once'
  rendered: boolean
}

export class RenderTargetPass implements RenderPass {
  readonly id = 'render-targets'
  readonly order = 50
  readonly featureKey = 'renderTargets' as const

  private readonly pool = new RenderTargetPool()
  private entries: RenderTargetEntry[] = []
  private settings: RenderSettings

  constructor(
    _renderer: THREE.WebGLRenderer,
    settings?: RenderSettings,
  ) {
    this.settings = settings ?? { features: { renderTargets: false } } as RenderSettings
  }

  setSettings(settings: RenderSettings): void {
    const wasEnabled = this.enabled(this.settings)
    this.settings = settings
    if (wasEnabled && !this.enabled(settings)) {
      this.pool.disposeAll()
      this.entries = []
    }
  }

  setEntries(entries: RenderTargetEntry[]): void {
    this.entries = entries
  }

  enabled(settings: RenderSettings): boolean {
    return isFeatureActive(settings, 'renderTargets') && this.entries.length > 0
  }

  resize(): void {}

  render(ctx: RenderContext, scene: THREE.Scene, _mainCamera: THREE.Camera): void {
    if (!this.enabled(this.settings)) return

    for (const entry of this.entries) {
      if (entry.updateMode === 'once' && entry.rendered) continue

      const rt = this.pool.getOrCreate(entry.entityId, entry.width, entry.height)
      const oldTarget = ctx.renderer.getRenderTarget()
      ctx.renderer.setRenderTarget(rt)
      ctx.renderer.clear()
      ctx.renderer.render(scene, entry.camera)
      ctx.renderer.setRenderTarget(oldTarget)
      entry.rendered = true
    }
  }

  getTexture(entityId: string): THREE.Texture | undefined {
    return this.pool.getTexture(entityId)
  }

  requestUpdate(entityId: string): void {
    const entry = this.entries.find((e) => e.entityId === entityId)
    if (entry) entry.rendered = false
  }

  dispose(): void {
    this.pool.disposeAll()
    this.entries = []
  }
}
