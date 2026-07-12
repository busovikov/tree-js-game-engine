import type { EntityId, IRenderBackend, IWorld, ViewportRenderOverrides } from '@haku/core'
import { entityId, CameraComponent, RenderTextureComponent } from '@haku/core'
import type { EngineFeatureFlags } from './engine.js'
import type { PrefabDefinition, RenderSettings } from '@haku/schema'
import { defaultRenderSettings, isFeatureActive, RenderSettingsSchema, resolveShadowSettings } from '@haku/schema'
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
import { EditorSelectionEdgeSync } from './render/passes/editor-selection-edges.js'
import { RenderTargetPass } from './render/passes/render-target-pass.js'
import {
  applyShadowSettings,
  applyToneMappingSettings,
  resolveOutputColorSpace,
} from './render/apply-render-settings.js'
import { resolveCameraLayerMask } from './render/layers/layer-resolver.js'

export type ViewportMode = 'scene' | 'view'

export { RenderSyncSystem } from './render-sync/render-sync-system.js'

export class ThreeRenderBackend implements IRenderBackend {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly syncSystem: RenderSyncSystem
  private readonly editorCamera: THREE.PerspectiveCamera
  private readonly editorSelectionEdges: EditorSelectionEdgeSync
  private readonly renderGraph: RenderGraph
  private readonly ambientLight: THREE.AmbientLight
  private world: IWorld | null = null
  private activeSceneCameraEntityId: EntityId | null = null
  private viewportMode: ViewportMode = 'scene'
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
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    this.scene.add(this.ambientLight)

    this.editorSelectionEdges = new EditorSelectionEdgeSync()
    this.renderGraph = new RenderGraph(this.renderer, this.renderSettings)

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
    return this.getViewportCamera()
  }

  getEditorCamera(): THREE.PerspectiveCamera {
    return this.editorCamera
  }

  getViewportMode(): ViewportMode {
    return this.viewportMode
  }

  setViewportMode(mode: ViewportMode): void {
    this.viewportMode = mode
    this.applyCameraLayers()
  }

  getActiveSceneCameraEntityId(): EntityId | null {
    return this.activeSceneCameraEntityId
  }

  getActiveSceneCamera(): THREE.Camera | null {
    if (!this.activeSceneCameraEntityId) return null
    return this.syncSystem.getEntityCamera(this.activeSceneCameraEntityId) ?? null
  }

  setActiveSceneCamera(activeId: EntityId | null): void {
    this.activeSceneCameraEntityId = activeId
    if (activeId) {
      this.syncSceneCameraProjection(activeId)
    }
    this.applyCameraLayers()
  }

  /** @deprecated Use setActiveSceneCamera */
  setActiveCamera(activeId: EntityId): void {
    this.setActiveSceneCamera(activeId)
  }

  applyEditorCameraState(position: readonly [number, number, number], target: readonly [number, number, number]): void {
    this.editorCamera.position.set(position[0], position[1], position[2])
    this.editorCamera.lookAt(target[0], target[1], target[2])
    this.editorCamera.updateMatrixWorld(true)
  }

  resolveShadowFollowCamera(): THREE.Camera | null {
    if (!isFeatureActive(this.renderSettings, 'shadows')) return null
    const shadows = resolveShadowSettings(this.renderSettings.shadows)
    if (!shadows.enabled || !shadows.followCamera) return null
    if (shadows.followEditorCamera) return this.editorCamera
    return this.getActiveSceneCamera()
  }

  private getViewportCamera(): THREE.Camera {
    if (this.viewportMode === 'view') {
      return this.getActiveSceneCamera() ?? this.editorCamera
    }
    return this.editorCamera
  }

  private syncSceneCameraProjection(activeId: EntityId): void {
    const camera = this.syncSystem.getEntityCamera(activeId)
    if (!camera) return
    const camData = this.world?.getComponent(activeId, CameraComponent)
    if (camera instanceof THREE.PerspectiveCamera && camData) {
      camera.fov = camData.fov
      camera.near = camData.near
      camera.far = camData.far
      camera.updateProjectionMatrix()
    }
  }

  attach(world: IWorld): void {
    this.world = world
    this.syncSystem.attach(world)
    this.syncRenderTargetEntries()
    if (this.activeSceneCameraEntityId) {
      this.syncSceneCameraProjection(this.activeSceneCameraEntityId)
    }
    this.applyCameraLayers()
  }

  detach(): void {
    this.syncSystem.detach()
    this.world = null
    this.editorSelectionEdges.setTargets([])
  }

  setRenderSettings(settings: RenderSettings): void {
    // Normalize so missing fields (e.g. legacy scenes saved before newer shadow
    // options) get schema defaults instead of producing NaN in the renderer.
    const normalized = RenderSettingsSchema.parse(settings)
    this.renderSettings = normalized
    this.syncSystem.setRenderSettings(normalized)
    this.applyRenderSettings(normalized)
    this.renderGraph.setSettings(normalized)
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
      this.editorSelectionEdges.setTargets([])
      return
    }
    this.editorSelectionEdges.setTargets(targets)
  }

  render(): void {
    this.syncRenderTargetEntries()
    this.syncSystem.updateDirectionalShadowRigs(this.resolveShadowFollowCamera())
    const camera = this.getViewportCamera()
    this.applyCameraLayers()
    this.renderGraph.render(this.scene, camera)
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    this.renderGraph.resize(width, height)
    const aspect = width / Math.max(height, 1)

    if (this.editorCamera instanceof THREE.PerspectiveCamera) {
      this.editorCamera.aspect = aspect
      this.editorCamera.updateProjectionMatrix()
    }

    this.syncSystem.updateCameraAspects(aspect)

    const activeSceneCamera = this.getActiveSceneCamera()
    if (activeSceneCamera instanceof THREE.PerspectiveCamera) {
      activeSceneCamera.aspect = aspect
      activeSceneCamera.updateProjectionMatrix()
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
    return this.syncSystem.pickEntityAt(clientX, clientY, canvas, this.editorCamera)
  }

  pickEntitiesInRect(
    clientLeft: number,
    clientTop: number,
    clientRight: number,
    clientBottom: number,
    canvas: HTMLCanvasElement,
  ): EntityId[] {
    if (this.features.viewportPicking === false) return []
    return this.syncSystem.pickEntitiesInRect(
      clientLeft,
      clientTop,
      clientRight,
      clientBottom,
      canvas,
      this.editorCamera,
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
    this.editorCamera.layers.mask = mask
    const activeSceneCamera = this.getActiveSceneCamera()
    if (activeSceneCamera) {
      activeSceneCamera.layers.mask = mask
    }
    if (this.viewportMode === 'view') {
      this.getViewportCamera().layers.mask = mask
    }
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
