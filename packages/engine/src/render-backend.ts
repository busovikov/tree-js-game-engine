import type { EntityId, IRenderBackend, IWorld, ISystem } from '@haku/core'
import {
  CameraComponent,
  LightComponent,
  MeshRendererComponent,
  PrefabInstanceComponent,
  TransformComponent,
} from '@haku/core'
import type { Light, PrefabDefinition, RenderPrototype, Transform } from '@haku/schema'
import * as THREE from 'three'

interface EntityRenderState {
  object3d: THREE.Object3D
}

type BucketMode = 'mesh' | 'instanced' | 'batched' | 'sprite-atlas'

export class RenderSyncSystem implements ISystem {
  readonly order = 100
  private readonly entityStates = new Map<string, EntityRenderState>()
  private readonly scene: THREE.Scene
  private readonly prototypes: Map<string, RenderPrototype>
  private prefabs: Map<string, PrefabDefinition> = new Map()
  private world: IWorld | null = null

  constructor(scene: THREE.Scene, prototypes: Map<string, RenderPrototype> = new Map()) {
    this.scene = scene
    this.prototypes = prototypes
  }

  setPrototypes(prototypes: Record<string, RenderPrototype>): void {
    this.prototypes.clear()
    for (const [id, proto] of Object.entries(prototypes)) {
      this.prototypes.set(id, proto)
    }
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

  private syncAll(): void {
    if (!this.world) return

    const alive = new Set<string>()

    for (const id of this.world.getAllEntities()) {
      alive.add(id.value)
      const transform = this.world.getComponent(id, TransformComponent)
      if (!transform) continue

      let state = this.entityStates.get(id.value)
      if (!state) {
        const object3d = this.createObjectForEntity(id)
        state = { object3d }
        this.entityStates.set(id.value, state)
        this.scene.add(object3d)
      }

      this.applyTransform(state.object3d, transform)
      this.syncLight(id, state.object3d)
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
      return new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    }

    if (this.world.hasComponent(id, LightComponent)) {
      const light = this.world.getComponent(id, LightComponent)!
      return this.createLight(light)
    }

    if (this.world.hasComponent(id, MeshRendererComponent)) {
      const meshRenderer = this.world.getComponent(id, MeshRendererComponent)!
      return this.createMesh(meshRenderer.prototypeId)
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

      const data = meshComp.data as { prototypeId: string }
      const t = transformComp.data as Transform
      const mesh = this.createMesh(data.prototypeId)
      mesh.position.set(...t.position)
      mesh.quaternion.set(...t.rotation)
      mesh.scale.set(...t.scale)
      group.add(mesh)
    }

    return group
  }

  private createMesh(prototypeId: string): THREE.Object3D {
    const proto = this.prototypes.get(prototypeId)
    const mode: BucketMode = proto?.mode ?? 'mesh'

    switch (mode) {
      case 'instanced':
      case 'batched':
      case 'sprite-atlas':
        // Stub hooks — fall back to single mesh for v1
        return new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x6699ff }),
        )
      case 'mesh':
      default:
        return new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x6699ff }),
        )
    }
  }

  private createLight(light: Light): THREE.Light {
    switch (light.type) {
      case 'point':
        return new THREE.PointLight(light.color, light.intensity)
      case 'spot':
        return new THREE.SpotLight(light.color, light.intensity)
      case 'directional':
      default:
        return new THREE.DirectionalLight(light.color, light.intensity)
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

  private syncLight(id: EntityId, object3d: THREE.Object3D): void {
    if (!this.world?.hasComponent(id, LightComponent)) return
    const lightData = this.world.getComponent(id, LightComponent)!
    if (object3d instanceof THREE.Light) {
      object3d.color.set(lightData.color)
      object3d.intensity = lightData.intensity
    }
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
  private world: IWorld | null = null
  private activeCamera: THREE.Camera

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(0x1a1a2e)
    this.syncSystem = new RenderSyncSystem(this.scene)
    this.activeCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
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

  attach(world: IWorld): void {
    this.world = world
    this.syncSystem.attach(world)
    this.pickActiveCamera(world)
  }

  detach(): void {
    this.syncSystem.detach()
    this.world = null
  }

  setActiveCamera(entityId: EntityId): void {
    const obj = this.syncSystem.getObject3D(entityId)
    if (obj instanceof THREE.PerspectiveCamera || obj instanceof THREE.OrthographicCamera) {
      this.activeCamera = obj
      const camData = this.world?.getComponent(entityId, CameraComponent)
      if (obj instanceof THREE.PerspectiveCamera && camData) {
        obj.fov = camData.fov
        obj.near = camData.near
        obj.far = camData.far
        obj.updateProjectionMatrix()
      }
    }
  }

  setPrototypes(prototypes: Record<string, RenderPrototype>): void {
    this.syncSystem.setPrototypes(prototypes)
  }

  setPrefabs(prefabs: Record<string, PrefabDefinition>): void {
    this.syncSystem.setPrefabs(prefabs)
  }

  render(): void {
    this.renderer.render(this.scene, this.activeCamera)
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    if (this.activeCamera instanceof THREE.PerspectiveCamera) {
      this.activeCamera.aspect = width / height
      this.activeCamera.updateProjectionMatrix()
    }
  }

  private pickActiveCamera(world: IWorld): void {
    for (const id of world.query(CameraComponent, TransformComponent)) {
      this.setActiveCamera(id)
      return
    }
  }
}
