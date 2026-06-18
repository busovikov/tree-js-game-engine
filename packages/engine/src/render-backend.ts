import type { EntityId, IRenderBackend, IWorld, ViewportRenderOverrides } from '@haku/core'
import { entityId, CameraComponent, RenderTextureComponent } from '@haku/core'
import type { EngineFeatureFlags } from './engine.js'
import type { PrefabDefinition, RenderSettings } from '@haku/schema'
import { defaultRenderSettings } from '@haku/schema'
import * as THREE from 'three'
import {
  setModelAssetResolver,
  setModelLoadPreparer,
  setModelResourceResolver,
  type ModelAssetResolver,
  type ModelLoadPreparer,
  type ModelResourceResolver,
} from './model-loader.js'
import { RenderSyncSystem } from './render-sync/render-sync-system.js'
import { RenderGraph } from './render/render-graph.js'
import { EditorSelectionOutlinePass } from './render/passes/editor-selection-outline.js'
import { RenderTargetPass } from './render/passes/render-target-pass.js'
import {
  applyShadowSettings,
  applyToneMappingSettings,
  resolveOutputColorSpace,
} from './render/apply-render-settings.js'
import { resolveCameraLayerMask } from './render/layers/layer-resolver.js'

export { RenderSyncSystem } from './render-sync/render-sync-system.js'

export class ThreeRenderBackend implements IRenderBackend {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly syncSystem: RenderSyncSystem
  private readonly editorCamera: THREE.PerspectiveCamera
  private readonly editorOutline: EditorSelectionOutlinePass
  private readonly renderGraph: RenderGraph
  private readonly ambientLight: THREE.AmbientLight
  private world: IWorld | null = null
  private activeCamera: THREE.Camera
  private viewportUsesEditorCamera = true
  private renderSettings: RenderSettings = defaultRenderSettings()
  private viewportOverrides: ViewportRenderOverrides = {}
  private features: EngineFeatureFlags

  constructor(canvas: HTMLCanvasElement, features: EngineFeatureFlags = {}) {
    this.features = features
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.syncSystem = new RenderSyncSystem(this.scene)
    this.editorCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    this.editorCamera.position.set(0, 2, 5)
    this.activeCamera = this.editorCamera
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    this.scene.add(this.ambientLight)

    this.editorOutline = new EditorSelectionOutlinePass(this.scene, () => this.activeCamera)
    this.renderGraph = new RenderGraph(this.renderer, this.renderSettings, {
      editorOutline: features.selectionOutline !== false ? this.editorOutline : undefined,
    })

    this.applyRenderSettings(this.renderSettings)
  }

  get threeScene(): THREE.Scene {
    return this.scene
  }

  get sync(): RenderSyncSystem {
    return this.syncSystem
  }

  get rendererInstance(): THREE.WebGLRenderer {
    return this.renderer
  }

  getActiveCamera(): THREE.Camera {
    return this.activeCamera
  }

  getEditorCamera(): THREE.PerspectiveCamera {
    return this.editorCamera
  }

  usesEditorViewportCamera(): boolean {
    return this.viewportUsesEditorCamera
  }

  useEditorViewportCamera(): void {
    this.viewportUsesEditorCamera = true
    this.activeCamera = this.editorCamera
    this.applyCameraLayers()
  }

  useSceneEntityCamera(entityId: EntityId): boolean {
    const camera = this.syncSystem.getEntityCamera(entityId)
    if (!camera) return false

    this.viewportUsesEditorCamera = false
    this.activeCamera = camera
    const camData = this.world?.getComponent(entityId, CameraComponent)
    if (camera instanceof THREE.PerspectiveCamera && camData) {
      camera.fov = camData.fov
      camera.near = camData.near
      camera.far = camData.far
      camera.updateProjectionMatrix()
    }
    this.applyCameraLayers()
    return true
  }

  attach(world: IWorld): void {
    this.world = world
    this.syncSystem.attach(world)
    this.syncRenderTargetEntries()
    if (this.viewportUsesEditorCamera) {
      this.useEditorViewportCamera()
    }
  }

  detach(): void {
    this.syncSystem.detach()
    this.world = null
    this.editorOutline.setTargets([])
  }

  setActiveCamera(entityId: EntityId): void {
    this.useSceneEntityCamera(entityId)
  }

  setRenderSettings(settings: RenderSettings): void {
    this.renderSettings = settings
    this.syncSystem.setRenderSettings(settings)
    this.applyRenderSettings(settings)
    this.renderGraph.setSettings(settings)
    this.syncRenderTargetEntries()
  }

  setViewportOverrides(overrides: ViewportRenderOverrides): void {
    this.viewportOverrides = overrides
    this.applyRenderSettings(this.renderSettings)
  }

  setPrototypes(_prototypes: Record<string, import('@haku/schema').RenderPrototype>): void {}

  setPrefabs(prefabs: Record<string, PrefabDefinition>): void {
    this.syncSystem.setPrefabs(prefabs)
  }

  setHierarchyFilterHighlight(ids: Set<string> | null): void {
    if (this.features.hierarchyDim === false) return
    this.syncSystem.setHierarchyFilterHighlight(ids)
  }

  setModelAssetResolver(resolver: ModelAssetResolver): void {
    setModelAssetResolver(resolver)
  }

  setModelResourceResolver(resolver: ModelResourceResolver | null): void {
    setModelResourceResolver(resolver)
  }

  setModelLoadPreparer(preparer: ModelLoadPreparer | null): void {
    setModelLoadPreparer(preparer)
  }

  setSelectionOutlineTargets(targets: readonly THREE.Object3D[]): void {
    if (this.features.selectionOutline === false) {
      this.editorOutline.setTargets([])
      return
    }
    this.editorOutline.setTargets(targets)
  }

  render(): void {
    this.syncRenderTargetEntries()
    this.syncSystem.updateDirectionalShadowRigs(this.activeCamera)
    this.renderGraph.render(this.scene, this.activeCamera)
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    const pixelRatio = this.renderer.getPixelRatio()
    const bufferWidth = Math.max(1, Math.round(width * pixelRatio))
    const bufferHeight = Math.max(1, Math.round(height * pixelRatio))
    this.editorOutline.setBufferSize(bufferWidth, bufferHeight, width, height)
    this.renderGraph.resize(width, height)
    const aspect = width / Math.max(height, 1)

    if (this.editorCamera instanceof THREE.PerspectiveCamera) {
      this.editorCamera.aspect = aspect
      this.editorCamera.updateProjectionMatrix()
    }

    this.syncSystem.updateCameraAspects(aspect)

    if (
      this.activeCamera !== this.editorCamera &&
      this.activeCamera instanceof THREE.PerspectiveCamera
    ) {
      this.activeCamera.aspect = aspect
      this.activeCamera.updateProjectionMatrix()
    }
  }

  pickEntityAt(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
  ): { entityId: EntityId | null; hitEditorOverlay: boolean } {
    if (this.features.viewportPicking === false) {
      return { entityId: null, hitEditorOverlay: false }
    }
    const camera = this.viewportUsesEditorCamera ? this.editorCamera : this.activeCamera
    return this.syncSystem.pickEntityAt(clientX, clientY, canvas, camera)
  }

  pickEntitiesInRect(
    clientLeft: number,
    clientTop: number,
    clientRight: number,
    clientBottom: number,
    canvas: HTMLCanvasElement,
  ): EntityId[] {
    if (this.features.viewportPicking === false) return []
    const camera = this.viewportUsesEditorCamera ? this.editorCamera : this.activeCamera
    return this.syncSystem.pickEntitiesInRect(
      clientLeft,
      clientTop,
      clientRight,
      clientBottom,
      canvas,
      camera,
    )
  }

  getRenderTarget(entityId: EntityId): unknown {
    const pass = this.renderGraph.getPass<RenderTargetPass>('render-targets')
    return pass?.getTexture(entityId.value)
  }

  requestRenderTargetUpdate(entityId: EntityId): void {
    const pass = this.renderGraph.getPass<RenderTargetPass>('render-targets')
    pass?.requestUpdate(entityId.value)
  }

  private applyRenderSettings(settings: RenderSettings): void {
    const previewShadows = this.viewportOverrides.previewShadows === true
    const effectiveSettings = previewShadows
      ? {
          ...settings,
          features: { ...settings.features, shadows: true },
          shadows: { ...settings.shadows, enabled: true },
        }
      : settings

    applyShadowSettings(this.renderer, effectiveSettings)
    applyToneMappingSettings(this.renderer, effectiveSettings)

    const colorSpaceName = resolveOutputColorSpace(effectiveSettings)
    if (colorSpaceName === 'SRGBColorSpace') {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
    } else {
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    }

    if (effectiveSettings.background.type === 'color') {
      this.scene.background = new THREE.Color(effectiveSettings.background.color)
    }

    this.ambientLight.color.set(effectiveSettings.ambient.color)
    this.ambientLight.intensity = effectiveSettings.ambient.intensity
    this.applyCameraLayers()
  }

  private applyCameraLayers(): void {
    const mask = resolveCameraLayerMask(this.renderSettings)
    this.activeCamera.layers.mask = mask
  }

  private syncRenderTargetEntries(): void {
    const pass = this.renderGraph.getPass<RenderTargetPass>('render-targets')
    if (!pass || !this.world) return

    const entries = []
    for (const id of this.world.getAllEntities()) {
      const rt = this.world.getComponent(id, RenderTextureComponent)
      if (!rt) continue
      const camera = this.syncSystem.getEntityCamera(entityId(rt.cameraEntityId))
      if (!camera) continue
      entries.push({
        entityId: id.value,
        camera,
        width: rt.width,
        height: rt.height,
        updateMode: rt.updateMode,
        rendered: false,
      })
    }
    pass.setEntries(entries)
  }
}
