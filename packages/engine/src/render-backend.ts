import type { EntityId, IRenderBackend, IWorld, ISystem } from '@haku/core'
import { entityId } from '@haku/core'
import {
  CameraComponent,
  LightComponent,
  MeshRendererComponent,
  PrefabInstanceComponent,
  TransformComponent,
} from '@haku/core'
import type { Light, MeshRenderer, PrefabDefinition, Transform } from '@haku/schema'
import { LightSchema, meshRendererKey, resolveLightColor, spotToThreeCone } from '@haku/schema'
import * as THREE from 'three'
import {
  createMeshFromRenderer,
  rebuildMesh,
  updateMeshMaterial,
} from './mesh-factory.js'

interface EntityRenderState {
  object3d: THREE.Object3D
  meshKey?: string
  visualKey: string
}

export class RenderSyncSystem implements ISystem {
  readonly order = 100
  private readonly entityStates = new Map<string, EntityRenderState>()
  private readonly scene: THREE.Scene
  private prefabs: Map<string, PrefabDefinition> = new Map()
  private world: IWorld | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
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
      this.scene.remove(state.object3d)
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
        this.scene.add(object3d)
      } else if (state.visualKey !== visualKey) {
        this.scene.remove(state.object3d)
        this.disposeObject(state.object3d)
        state.object3d = this.createObjectForEntity(id)
        state.visualKey = visualKey
        state.meshKey = this.getMeshKey(id)
        this.scene.add(state.object3d)
      } else {
        this.syncMeshVisual(id, state)
      }

      this.tagPickable(state.object3d, id.value)
      this.applyTransform(state.object3d, transform)
      this.syncLight(id, state.object3d)
      this.syncCamera(id, state.object3d)
    }

    for (const [id, state] of this.entityStates) {
      if (!alive.has(id)) {
        this.scene.remove(state.object3d)
        this.disposeObject(state.object3d)
        this.entityStates.delete(id)
      }
    }
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
      return `mesh:${meshRendererKey(this.world.getComponent(id, MeshRendererComponent)!)}`
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

    if (!(state.object3d instanceof THREE.Mesh)) return

    if (state.meshKey === nextKey) {
      updateMeshMaterial(state.object3d, meshRenderer)
      return
    }

    rebuildMesh(state.object3d, meshRenderer)
    state.meshKey = nextKey
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

  private applyTransform(object3d: THREE.Object3D, transform: Transform): void {
    object3d.position.set(...transform.position)
    object3d.quaternion.set(...transform.rotation)
    object3d.scale.set(...transform.scale)
    object3d.updateMatrixWorld(true)
  }

  syncEntityTransform(entityId: EntityId): void {
    if (!this.world) return
    const transform = this.world.getComponent(entityId, TransformComponent)
    const state = this.entityStates.get(entityId.value)
    if (!transform || !state) return
    this.applyTransform(state.object3d, transform)
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
        if (!closest || hit.distance < closest.distance) {
          closest = { entityId: picked, distance: hit.distance }
        }
      }
    }

    if (
      closest &&
      this.shouldBlockCameraPickFromOverlay(clientX, clientY, rect, pickRoots, camera, closest.entityId)
    ) {
      return { entityId: null, hitEditorOverlay: true }
    }

    return { entityId: closest?.entityId ?? null, hitEditorOverlay: false }
  }

  /** Block camera selection when the click is on its frustum overlay, not the pick handle. */
  private shouldBlockCameraPickFromOverlay(
    clientX: number,
    clientY: number,
    rect: DOMRect,
    pickRoots: THREE.Object3D[],
    viewportCamera: THREE.Camera,
    picked: EntityId,
  ): boolean {
    if (!this.world?.hasComponent(picked, CameraComponent)) return false

    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, viewportCamera)

    for (const hit of raycaster.intersectObjects(pickRoots, true)) {
      if (this.isViewportPickable(hit.object)) return false
      const overlayEntity = this.resolveEntityId(hit.object)
      if (overlayEntity?.value === picked.value) return true
    }

    return false
  }

  private isViewportPickable(object: THREE.Object3D): boolean {
    if (object.userData.hakuEditorPickTarget) return true
    if (object.userData.hakuEditorOverlay) return false
    return true
  }

  private getPickRoots(): THREE.Object3D[] {
    const roots: THREE.Object3D[] = []
    for (const state of this.entityStates.values()) {
      roots.push(state.object3d)
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

export class ThreeRenderBackend implements IRenderBackend {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly syncSystem: RenderSyncSystem
  private readonly editorCamera: THREE.PerspectiveCamera
  private world: IWorld | null = null
  private activeCamera: THREE.Camera
  private viewportUsesEditorCamera = true

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(0x1a1a2e)
    this.syncSystem = new RenderSyncSystem(this.scene)
    this.editorCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    this.editorCamera.position.set(0, 2, 5)
    this.activeCamera = this.editorCamera
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3))
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
  }

  useSceneEntityCamera(entityId: EntityId): boolean {
    const camera = this.syncSystem.getEntityCamera(entityId)
    if (!camera) {
      return false
    }

    this.viewportUsesEditorCamera = false
    this.activeCamera = camera
    const camData = this.world?.getComponent(entityId, CameraComponent)
    if (camera instanceof THREE.PerspectiveCamera && camData) {
      camera.fov = camData.fov
      camera.near = camData.near
      camera.far = camData.far
      camera.updateProjectionMatrix()
    }
    return true
  }

  attach(world: IWorld): void {
    this.world = world
    this.syncSystem.attach(world)
    if (this.viewportUsesEditorCamera) {
      this.useEditorViewportCamera()
    }
  }

  detach(): void {
    this.syncSystem.detach()
    this.world = null
  }

  setActiveCamera(entityId: EntityId): void {
    this.useSceneEntityCamera(entityId)
  }

  setPrototypes(_prototypes: Record<string, import('@haku/schema').RenderPrototype>): void {
    // Prototypes reserved for future asset-backed meshes; primitives use MeshRenderer data.
  }

  setPrefabs(prefabs: Record<string, PrefabDefinition>): void {
    this.syncSystem.setPrefabs(prefabs)
  }

  render(): void {
    this.renderer.render(this.scene, this.activeCamera)
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
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
    const camera = this.viewportUsesEditorCamera ? this.editorCamera : this.activeCamera
    return this.syncSystem.pickEntityAt(clientX, clientY, canvas, camera)
  }
}
