import type { EntityId, IWorld, ISystem } from '@haku/core'
import { entityId } from '@haku/core'
import {
  CameraComponent,
  LightComponent,
  MeshRendererComponent,
  PrefabInstanceComponent,
  RenderingLayersComponent,
  StaticComponent,
  TransformComponent,
} from '@haku/core'
import type { Light, MeshRenderer, PrefabDefinition, RenderSettings, Transform } from '@haku/schema'
import { LightSchema, defaultRenderSettings, meshRendererKey, resolveLightColor, resolveShadowSettings, spotToThreeCone, isFeatureActive } from '@haku/schema'
import * as THREE from 'three'
import {
  createMeshFromRenderer,
  rebuildMesh,
  updateMeshMaterial,
  applyMaterial,
} from '../mesh-factory.js'
import { applyMaterialToObject } from '../model-loader.js'
import { syncWireframeOverlay } from '../editor-wireframe-overlay.js'
import { setObjectEditorDimmed } from '../editor-visual-dim.js'
import { countObject3DMeshes, modelLog, modelLogError, modelLogWarn } from '../model-log.js'
import {
  loadModelTemplate,
} from '../model-loader.js'
import { syncMeshShadowFlags } from './sync-mesh-shadow.js'
import { computeMeshWorldBounds, fitDirectionalShadowCamera } from './fit-directional-shadow.js'
import { applyLayerMask, resolveEntityLayerMask } from '../render/layers/layer-resolver.js'

const MODEL_ROOT_NAME = 'haku-model-root'

interface EntityRenderState {
  object3d: THREE.Object3D
  meshKey?: string
  visualKey: string
  modelLoadId?: number
  loadedModelAsset?: string
  pendingModelAsset?: string
}

export class RenderSyncSystem implements ISystem {
  readonly order = 100
  private readonly entityStates = new Map<string, EntityRenderState>()
  private readonly scene: THREE.Scene
  private prefabs: Map<string, PrefabDefinition> = new Map()
  private world: IWorld | null = null
  private hierarchyHighlightIds: Set<string> | null = null
  private renderSettings: RenderSettings = defaultRenderSettings()
  private shadowCasterCount = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  setRenderSettings(settings: RenderSettings): void {
    this.renderSettings = settings
  }

  setPrefabs(prefabs: Record<string, PrefabDefinition>): void {
    this.prefabs.clear()
    for (const [id, def] of Object.entries(prefabs)) {
      this.prefabs.set(id, def)
    }
  }

  attach(world: IWorld): void {
    this.world = world
    this.syncAll()
  }

  detach(): void {
    for (const state of this.entityStates.values()) {
      state.object3d.removeFromParent()
      this.disposeObject(state.object3d)
    }
    this.entityStates.clear()
    this.world = null
  }

  update(world: IWorld): void {
    this.world = world
    this.syncAll()
  }

  getObject3D(entityId: EntityId): THREE.Object3D | undefined {
    return this.entityStates.get(entityId.value)?.object3d
  }

  setHierarchyFilterHighlight(ids: Set<string> | null): void {
    this.hierarchyHighlightIds = ids
    this.applyHierarchyVisualWeight()
  }

  private applyHierarchyVisualWeight(): void {
    const highlightIds = this.hierarchyHighlightIds
    const filterActive = highlightIds !== null
    for (const [id, state] of this.entityStates) {
      const highlighted = !filterActive || highlightIds.has(id)
      setObjectEditorDimmed(state.object3d, !highlighted)
    }
  }

  getEntityCamera(entityId: EntityId): THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined {
    const object3d = this.getObject3D(entityId)
    if (!object3d) return undefined
    return this.findCamera(object3d) ?? undefined
  }

  updateCameraAspects(aspect: number): void {
    for (const state of this.entityStates.values()) {
      const camera = this.findCamera(state.object3d)
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = aspect
        camera.updateProjectionMatrix()
      }
    }
  }

  private syncAll(): void {
    if (!this.world) return

    const alive = new Set<string>()
    this.shadowCasterCount = 0

    for (const id of this.world.getAllEntities()) {
      alive.add(id.value)
      const transform = this.world.getComponent(id, TransformComponent)
      if (!transform) continue

      let state = this.entityStates.get(id.value)
      const visualKey = this.getVisualKey(id)

      if (!state) {
        const object3d = this.createObjectForEntity(id)
        state = { object3d, meshKey: this.getMeshKey(id), visualKey }
        this.entityStates.set(id.value, state)
      } else if (state.visualKey !== visualKey) {
        state.object3d.removeFromParent()
        this.disposeObject(state.object3d)
        state.object3d = this.createObjectForEntity(id)
        state.visualKey = visualKey
        state.meshKey = this.getMeshKey(id)
        state.loadedModelAsset = undefined
        state.pendingModelAsset = undefined
        state.modelLoadId = 0
      }

      if (this.world.hasComponent(id, MeshRendererComponent)) {
        this.syncMeshVisual(id, state)
      }

      this.tagPickable(state.object3d, id.value)
      const isStatic = this.isEntityStatic(id)
      this.applyTransform(state.object3d, transform, isStatic)
      this.syncLight(id, state.object3d)
      this.syncCamera(id, state.object3d)
      this.syncEntityLayers(id, state.object3d)
    }

    for (const [id, state] of this.entityStates) {
      if (!alive.has(id)) {
        state.object3d.removeFromParent()
        this.disposeObject(state.object3d)
        this.entityStates.delete(id)
      }
    }

    this.syncSceneHierarchy()
    this.applyHierarchyVisualWeight()
    this.fitDirectionalShadowCameras()
  }

  private fitDirectionalShadowCameras(): void {
    if (!isFeatureActive(this.renderSettings, 'shadows')) return
    const shadows = resolveShadowSettings(this.renderSettings.shadows)
    if (!shadows.enabled) return

    this.scene.updateMatrixWorld(true)
    const bounds = computeMeshWorldBounds(this.scene)

    for (const state of this.entityStates.values()) {
      const light = this.findLight(state.object3d)
      if (light instanceof THREE.DirectionalLight && light.castShadow) {
        fitDirectionalShadowCamera(light, bounds)
      }
    }
  }

  private syncSceneHierarchy(): void {
    if (!this.world) return

    for (const id of this.world.getAllEntities()) {
      const state = this.entityStates.get(id.value)
      if (!state) continue

      const parentId = this.world.getParent(id)
      let desiredParent: THREE.Object3D = this.scene

      if (parentId) {
        const parentState = this.entityStates.get(parentId.value)
        if (parentState) {
          desiredParent = parentState.object3d
        }
      }

      if (state.object3d.parent !== desiredParent) {
        desiredParent.add(state.object3d)
      }
    }

    this.scene.updateMatrixWorld(true)
  }

  private createObjectForEntity(id: EntityId): THREE.Object3D {
    if (!this.world) return new THREE.Group()

    if (this.world.hasComponent(id, CameraComponent)) {
      const camData = this.world.getComponent(id, CameraComponent)!
      const group = new THREE.Group()
      const camera = new THREE.PerspectiveCamera(camData.fov, 1, camData.near, camData.far)
      group.add(camera)
      return group
    }

    if (this.world.hasComponent(id, LightComponent)) {
      const light = this.getLightData(id)
      if (light) return this.createLightEntity(light)
    }

    if (this.world.hasComponent(id, MeshRendererComponent)) {
      const meshRenderer = this.world.getComponent(id, MeshRendererComponent)!
      return createMeshFromRenderer(meshRenderer)
    }

    if (this.world.hasComponent(id, PrefabInstanceComponent)) {
      return this.createPrefabVisual(id)
    }

    return new THREE.Group()
  }

  private createPrefabVisual(id: EntityId): THREE.Object3D {
    const group = new THREE.Group()
    const instance = this.world!.getComponent(id, PrefabInstanceComponent)
    if (!instance) return group

    const prefab = this.prefabs.get(instance.prefabId)
    if (!prefab) return group

    for (const record of prefab.entities) {
      const meshComp = record.components.find((c) => c.type === 'MeshRenderer')
      const transformComp = record.components.find((c) => c.type === 'Transform')
      if (!meshComp || !transformComp) continue

      const data = meshComp.data as MeshRenderer
      const t = transformComp.data as Transform
      const mesh = createMeshFromRenderer(data)
      mesh.position.set(...t.position)
      mesh.quaternion.set(...t.rotation)
      mesh.scale.set(...t.scale)
      group.add(mesh)
    }

    return group
  }

  private getMeshKey(id: EntityId): string | undefined {
    if (!this.world?.hasComponent(id, MeshRendererComponent)) return undefined
    const meshRenderer = this.world.getComponent(id, MeshRendererComponent)
    return meshRenderer ? meshRendererKey(meshRenderer) : undefined
  }

  private getVisualKey(id: EntityId): string {
    if (!this.world) return 'group'

    if (this.world.hasComponent(id, CameraComponent)) return 'camera'

    if (this.world.hasComponent(id, LightComponent)) {
      const light = this.world.getComponent(id, LightComponent)!
      return `light:${light.type}`
    }

    if (this.world.hasComponent(id, MeshRendererComponent)) {
      const meshRenderer = this.world.getComponent(id, MeshRendererComponent)!
      if (meshRenderer.geometryType === 'ModelGeometry') {
        return `model:${meshRenderer.modelAsset}`
      }
      return `mesh:${meshRendererKey(meshRenderer)}`
    }

    if (this.world.hasComponent(id, PrefabInstanceComponent)) {
      const instance = this.world.getComponent(id, PrefabInstanceComponent)!
      return `prefab:${instance.prefabId}`
    }

    return 'group'
  }

  private syncMeshVisual(id: EntityId, state: EntityRenderState): void {
    if (!this.world?.hasComponent(id, MeshRendererComponent)) return
    const meshRenderer = this.world.getComponent(id, MeshRendererComponent)!
    const nextKey = meshRendererKey(meshRenderer)

    if (meshRenderer.geometryType === 'ModelGeometry') {
      this.syncModelVisual(id, state, meshRenderer, nextKey)
      return
    }

    if (!(state.object3d instanceof THREE.Mesh)) return

    if (state.meshKey === nextKey) {
      updateMeshMaterial(state.object3d, meshRenderer)
      syncMeshShadowFlags(state.object3d, meshRenderer)
      return
    }

    rebuildMesh(state.object3d, meshRenderer)
    state.meshKey = nextKey
    state.loadedModelAsset = undefined
    syncMeshShadowFlags(state.object3d, meshRenderer)
  }

  private syncModelVisual(
    id: EntityId,
    state: EntityRenderState,
    meshRenderer: MeshRenderer,
    meshKey: string,
  ): void {
    const modelAsset = meshRenderer.modelAsset.trim()
    state.meshKey = meshKey

    const existingRoot = state.object3d.getObjectByName(MODEL_ROOT_NAME)
    if (!modelAsset) {
      modelLog('sync.clear', { entityId: id.value })
      existingRoot?.removeFromParent()
      state.loadedModelAsset = undefined
      state.pendingModelAsset = undefined
      return
    }

    if (state.loadedModelAsset === modelAsset && existingRoot) {
      modelLog('sync.already-loaded', { entityId: id.value, modelAsset })
      this.applyRendererMaterial(state.object3d, meshRenderer.material)
      syncMeshShadowFlags(state.object3d, meshRenderer)
      return
    }

    if (state.pendingModelAsset === modelAsset) {
      modelLog('sync.pending', { entityId: id.value, modelAsset, loadId: state.modelLoadId })
      return
    }

    state.pendingModelAsset = modelAsset
    const loadId = (state.modelLoadId ?? 0) + 1
    state.modelLoadId = loadId

    modelLog('sync.load.start', {
      entityId: id.value,
      modelAsset,
      loadId,
      previousAsset: state.loadedModelAsset,
      hadExistingRoot: !!existingRoot,
    })

    void loadModelTemplate(modelAsset)
      .then((model) => {
        if (state.modelLoadId !== loadId || !this.world) {
          modelLogWarn('sync.load.stale', {
            entityId: id.value,
            modelAsset,
            loadId,
            currentLoadId: state.modelLoadId,
            hasWorld: !!this.world,
          })
          return
        }

        state.object3d.getObjectByName(MODEL_ROOT_NAME)?.removeFromParent()

        const wrapper = new THREE.Group()
        wrapper.name = MODEL_ROOT_NAME
        wrapper.add(model)
        state.object3d.add(wrapper)
        state.loadedModelAsset = modelAsset
        state.pendingModelAsset = undefined

        const currentRenderer = this.world.getComponent(id, MeshRendererComponent)
        if (currentRenderer) {
          this.applyRendererMaterial(state.object3d, currentRenderer.material)
          syncMeshShadowFlags(state.object3d, currentRenderer)
        }
        this.tagPickable(state.object3d, id.value)
        this.applyHierarchyVisualWeight()
        this.scene.updateMatrixWorld(true)

        modelLog('sync.load.attached', {
          entityId: id.value,
          modelAsset,
          loadId,
          meshCount: countObject3DMeshes(model),
        })
      })
      .catch((error) => {
        modelLogError('sync.load.failed', { entityId: id.value, modelAsset, loadId }, error)
        if (state.modelLoadId === loadId) {
          state.pendingModelAsset = undefined
        }
      })
  }

  private applyRendererMaterial(object3d: THREE.Object3D, material: MeshRenderer['material']): void {
    const isModel = object3d.getObjectByName(MODEL_ROOT_NAME) != null

    if (isModel) {
      applyMaterialToObject(object3d, (meshMaterial) => {
        const editable = meshMaterial as THREE.Material & { wireframe?: boolean }
        if (typeof editable.wireframe === 'boolean') {
          editable.wireframe = false
        }
        applyMaterial(meshMaterial, material)
      })
      syncWireframeOverlay(
        object3d,
        'wireframe' in material ? material.wireframe : false,
        'color' in material ? material.color : '#ffffff',
      )
      return
    }

    applyMaterialToObject(object3d, (meshMaterial) => applyMaterial(meshMaterial, material))
  }

  private getLightData(id: EntityId): Light | null {
    if (!this.world?.hasComponent(id, LightComponent)) return null
    const raw = this.world.getComponent(id, LightComponent)
    if (!raw) return null
    return LightSchema.parse(raw)
  }

  private createLightEntity(light: Light): THREE.Group {
    const group = new THREE.Group()
    const threeLight = this.createThreeLight(light)
    group.add(threeLight)

    if (threeLight instanceof THREE.DirectionalLight || threeLight instanceof THREE.SpotLight) {
      const target = new THREE.Object3D()
      target.position.set(0, 0, -1)
      group.add(target)
      threeLight.target = target
    }

    return group
  }

  private createThreeLight(light: Light): THREE.Light {
    const color = resolveLightColor(light)
    switch (light.type) {
      case 'point': {
        const point = new THREE.PointLight(color, light.intensity, light.distance, light.decay)
        return point
      }
      case 'spot': {
        const { angleRad, penumbra } = spotToThreeCone(light)
        return new THREE.SpotLight(
          color,
          light.intensity,
          light.distance,
          angleRad,
          penumbra,
          light.decay,
        )
      }
      case 'directional':
        return new THREE.DirectionalLight(color, light.intensity)
    }
  }

  private isEntityStatic(id: EntityId): boolean {
    if (!this.world?.hasComponent(id, StaticComponent)) return false
    return this.world.getComponent(id, StaticComponent)?.isStatic ?? false
  }

  private applyTransform(object3d: THREE.Object3D, transform: Transform, isStatic: boolean): void {
    object3d.position.set(...transform.position)
    object3d.quaternion.set(...transform.rotation)
    object3d.scale.set(...transform.scale)
    object3d.matrixAutoUpdate = !isStatic
    object3d.userData.hakuStatic = isStatic
    if (isStatic) {
      object3d.updateMatrix()
    }
    object3d.updateMatrixWorld(true)
  }

  syncEntityTransform(entityId: EntityId): void {
    if (!this.world) return
    const transform = this.world.getComponent(entityId, TransformComponent)
    const state = this.entityStates.get(entityId.value)
    if (!transform || !state) return
    this.applyTransform(state.object3d, transform, this.isEntityStatic(entityId))
  }

  pickEntityAt(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
    camera: THREE.Camera,
  ): { entityId: EntityId | null; hitEditorOverlay: boolean } {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return { entityId: null, hitEditorOverlay: false }
    }

    const pickRoots = this.getPickRoots()
    if (pickRoots.length === 0) {
      return { entityId: null, hitEditorOverlay: false }
    }

    camera.updateMatrixWorld(true)

    const ndc = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()

    // Sample around the cursor so clicks near edges/silhouettes still register.
    const sampleOffsetsPx = [
      [0, 0],
      [-5, 0],
      [5, 0],
      [0, -5],
      [0, 5],
      [-4, -4],
      [4, -4],
      [-4, 4],
      [4, 4],
    ]

    let closest: { entityId: EntityId; distance: number } | null = null

    for (const [offsetX, offsetY] of sampleOffsetsPx) {
      ndc.set(
        ((clientX + offsetX - rect.left) / rect.width) * 2 - 1,
        -((clientY + offsetY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)

      const hits = raycaster.intersectObjects(pickRoots, true)
      for (const hit of hits) {
        if (!this.isViewportPickable(hit.object)) continue
        const picked = this.resolveEntityId(hit.object)
        if (!picked) continue
        if (!this.isCameraPickHit(hit.object, picked)) continue
        if (!closest || hit.distance < closest.distance) {
          closest = { entityId: picked, distance: hit.distance }
        }
      }
    }

    if (closest) {
      return { entityId: closest.entityId, hitEditorOverlay: false }
    }

    return { entityId: null, hitEditorOverlay: false }
  }

  pickEntitiesInRect(
    clientLeft: number,
    clientTop: number,
    clientRight: number,
    clientBottom: number,
    canvas: HTMLCanvasElement,
    camera: THREE.Camera,
  ): EntityId[] {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return []

    const left = Math.min(clientLeft, clientRight)
    const right = Math.max(clientLeft, clientRight)
    const top = Math.min(clientTop, clientBottom)
    const bottom = Math.max(clientTop, clientBottom)

    camera.updateMatrixWorld(true)

    const box = new THREE.Box3()
    const corner = new THREE.Vector3()
    const projected = new THREE.Vector3()
    const selected: EntityId[] = []

    for (const [id, state] of this.entityStates) {
      const object3d = state.object3d
      object3d.updateMatrixWorld(true)
      box.setFromObject(object3d)
      if (box.isEmpty()) continue

      let fullyInside = true
      for (let xi = 0; xi < 2 && fullyInside; xi++) {
        for (let yi = 0; yi < 2 && fullyInside; yi++) {
          for (let zi = 0; zi < 2 && fullyInside; zi++) {
            corner.set(
              xi === 0 ? box.min.x : box.max.x,
              yi === 0 ? box.min.y : box.max.y,
              zi === 0 ? box.min.z : box.max.z,
            )
            projected.copy(corner).project(camera)

            const clientX = rect.left + ((projected.x + 1) / 2) * rect.width
            const clientY = rect.top + ((-projected.y + 1) / 2) * rect.height

            if (clientX < left || clientX > right || clientY < top || clientY > bottom) {
              fullyInside = false
            }
          }
        }
      }

      if (fullyInside) {
        selected.push(entityId(id))
      }
    }

    return selected
  }

  private isViewportPickable(object: THREE.Object3D): boolean {
    if (object.userData.hakuEditorPickTarget) return true

    let current: THREE.Object3D | null = object
    while (current) {
      if (current.userData.hakuEditorOverlay) return false
      current = current.parent
    }

    return true
  }

  private isCameraPickHit(object: THREE.Object3D, entityId: EntityId): boolean {
    if (!this.world?.hasComponent(entityId, CameraComponent)) return true
    return object.userData.hakuEditorPickTarget === true
  }

  private getPickRoots(): THREE.Object3D[] {
    const roots: THREE.Object3D[] = []
    for (const state of this.entityStates.values()) {
      if (state.object3d.parent === this.scene) {
        roots.push(state.object3d)
      }
    }
    return roots
  }

  private tagPickable(object3d: THREE.Object3D, id: string): void {
    object3d.userData.hakuEntityId = id
    object3d.traverse((child) => {
      if (child.userData.hakuEditorOverlay && !child.userData.hakuEditorPickTarget) return
      child.userData.hakuEntityId = id
    })
  }

  private resolveEntityId(object: THREE.Object3D): EntityId | null {
    let current: THREE.Object3D | null = object
    while (current) {
      const idValue = current.userData.hakuEntityId as string | undefined
      if (idValue) return entityId(idValue)
      current = current.parent
    }
    return null
  }

  private syncLight(id: EntityId, object3d: THREE.Object3D): void {
    const lightData = this.getLightData(id)
    if (!lightData) return
    const light = this.findLight(object3d)
    if (!light) return

    light.color.set(resolveLightColor(lightData))
    light.intensity = lightData.intensity

    const shadows = resolveShadowSettings(this.renderSettings.shadows)
    const shadowsActive = isFeatureActive(this.renderSettings, 'shadows') && shadows.enabled
    const castShadow = 'castShadow' in lightData ? Boolean(lightData.castShadow) : false
    const wantsShadow = shadowsActive && (castShadow || lightData.type === 'directional')
    const canCast =
      wantsShadow && this.shadowCasterCount < shadows.maxCasters

    if (canCast && light instanceof THREE.DirectionalLight) {
      light.castShadow = true
      light.shadow.mapSize.set(shadows.mapSize, shadows.mapSize)
      light.shadow.bias = ('shadowBias' in lightData ? lightData.shadowBias : undefined) ?? shadows.bias
      light.shadow.normalBias =
        ('shadowNormalBias' in lightData ? lightData.shadowNormalBias : undefined) ?? shadows.normalBias
      if ('shadowMapSize' in lightData && lightData.shadowMapSize) {
        light.shadow.mapSize.set(lightData.shadowMapSize, lightData.shadowMapSize)
      }
      this.shadowCasterCount++
    } else {
      light.castShadow = false
    }

    if (light instanceof THREE.PointLight && lightData.type === 'point') {
      light.distance = lightData.distance
      light.decay = lightData.decay
    }

    if (light instanceof THREE.SpotLight && lightData.type === 'spot') {
      const { angleRad, penumbra } = spotToThreeCone(lightData)
      light.distance = lightData.distance
      light.decay = lightData.decay
      light.angle = angleRad
      light.penumbra = penumbra
    }
  }

  private findLight(object3d: THREE.Object3D): THREE.Light | null {
    if (object3d instanceof THREE.Light) return object3d

    let found: THREE.Light | null = null
    object3d.traverse((child) => {
      if (!found && child instanceof THREE.Light) {
        found = child
      }
    })
    return found
  }

  private syncEntityLayers(id: EntityId, object3d: THREE.Object3D): void {
    const layers = this.world?.getComponent(id, RenderingLayersComponent)
    const mask = resolveEntityLayerMask(layers?.mask, this.renderSettings)
    applyLayerMask(object3d, mask)
  }

  private syncCamera(id: EntityId, object3d: THREE.Object3D): void {
    if (!this.world?.hasComponent(id, CameraComponent)) return
    const camData = this.world.getComponent(id, CameraComponent)!
    const camera = this.findCamera(object3d)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = camData.fov
      camera.near = camData.near
      camera.far = camData.far
      camera.updateProjectionMatrix()
    }
  }

  private findCamera(object3d: THREE.Object3D): THREE.PerspectiveCamera | THREE.OrthographicCamera | null {
    if (object3d instanceof THREE.PerspectiveCamera || object3d instanceof THREE.OrthographicCamera) {
      return object3d
    }

    let found: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null
    object3d.traverse((child) => {
      if (
        !found &&
        (child instanceof THREE.PerspectiveCamera || child instanceof THREE.OrthographicCamera)
      ) {
        found = child
      }
    })
    return found
  }

  private disposeObject(object3d: THREE.Object3D): void {
    object3d.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
}
