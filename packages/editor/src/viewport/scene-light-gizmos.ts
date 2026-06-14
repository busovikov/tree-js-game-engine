import type { EntityId, IWorld } from '@haku/core'
import { LightComponent, TransformComponent } from '@haku/core'
import type { Light } from '@haku/schema'
import { LightSchema } from '@haku/schema'
import * as THREE from 'three'
import { buildLightGizmoPositions, buildSpotLightGizmoGeometry } from './light-gizmo-geometry.js'

const OVERLAY_NAME = 'haku-light-overlay'

interface LightSyncAccess {
  getObject3D(entityId: EntityId): THREE.Object3D | undefined
}

interface LightGizmoEntry {
  overlay: THREE.Group
  icon: THREE.Object3D
  settings: THREE.LineSegments
  settingsMaterial: THREE.LineBasicMaterial
  settingsInner: THREE.LineSegments
  settingsInnerMaterial: THREE.LineBasicMaterial
  pickMesh: THREE.Mesh
  pickMaterial: THREE.MeshBasicMaterial
  lightType: Light['type']
}

export interface SceneLightGizmosOptions {
  visible: boolean
  selectedId: string | null
}

function lineMaterial(color: number, opacity: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  })
}

function createLightBulbIcon(): THREE.Object3D {
  const material = lineMaterial(0xffdd88, 1)
  const group = new THREE.Group()

  const bulb = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.SphereGeometry(0.12, 10, 8)),
    material,
  )
  group.add(bulb)

  const stem = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0.12, 0, 0, 0.22, 0]), 3),
    ),
    material,
  )
  group.add(stem)

  return group
}

function setLinePositions(lines: THREE.LineSegments, positions: Float32Array): void {
  const geometry = lines.geometry as THREE.BufferGeometry
  if (positions.length === 0) {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    return
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeBoundingSphere()
}

function ensureOverlay(root: THREE.Object3D): Omit<LightGizmoEntry, 'lightType'> {
  const existing = root.getObjectByName(OVERLAY_NAME)
  if (existing instanceof THREE.Group) {
    const settings = existing.getObjectByName('settings')
    const settingsInner = existing.getObjectByName('settings-inner')
    const pickMesh = existing.getObjectByName('pick')
    const icon = existing.children.find(
      (child) => child.name !== 'settings' && child.name !== 'settings-inner' && child.name !== 'pick',
    )
    if (
      settings instanceof THREE.LineSegments &&
      settingsInner instanceof THREE.LineSegments &&
      pickMesh instanceof THREE.Mesh &&
      icon &&
      settings.material instanceof THREE.LineBasicMaterial &&
      settingsInner.material instanceof THREE.LineBasicMaterial &&
      pickMesh.material instanceof THREE.MeshBasicMaterial
    ) {
      return {
        overlay: existing,
        icon,
        settings,
        settingsMaterial: settings.material,
        settingsInner,
        settingsInnerMaterial: settingsInner.material,
        pickMesh,
        pickMaterial: pickMesh.material,
      }
    }
  }

  const overlay = new THREE.Group()
  overlay.name = OVERLAY_NAME
  overlay.userData.hakuEditorOverlay = true

  const icon = createLightBulbIcon()
  overlay.add(icon)

  const settingsMaterial = lineMaterial(0xffcc66, 0.75)
  const settings = new THREE.LineSegments(new THREE.BufferGeometry(), settingsMaterial)
  settings.name = 'settings'
  settings.renderOrder = 1000
  overlay.add(settings)

  const settingsInnerMaterial = lineMaterial(0x69db7c, 0.95)
  const settingsInner = new THREE.LineSegments(new THREE.BufferGeometry(), settingsInnerMaterial)
  settingsInner.name = 'settings-inner'
  settingsInner.renderOrder = 1001
  overlay.add(settingsInner)

  const pickMaterial = new THREE.MeshBasicMaterial({
    color: 0xffcc66,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    depthTest: false,
  })
  const pickMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), pickMaterial)
  pickMesh.name = 'pick'
  pickMesh.renderOrder = 999
  overlay.add(pickMesh)

  root.add(overlay)
  return {
    overlay,
    icon,
    settings,
    settingsMaterial,
    settingsInner,
    settingsInnerMaterial,
    pickMesh,
    pickMaterial,
  }
}

function updateSettingsGeometry(entry: LightGizmoEntry, light: Light): void {
  if (light.type === 'spot') {
    const { outer, inner } = buildSpotLightGizmoGeometry(light)
    setLinePositions(entry.settings, outer)
    setLinePositions(entry.settingsInner, inner)
    entry.settingsInner.visible = inner.length > 0
    return
  }

  setLinePositions(entry.settings, buildLightGizmoPositions(light))
  setLinePositions(entry.settingsInner, new Float32Array(0))
  entry.settingsInner.visible = false
}

export class SceneLightGizmos {
  private readonly entries = new Map<string, LightGizmoEntry>()

  sync(world: IWorld, sync: LightSyncAccess, options: SceneLightGizmosOptions): void {
    const alive = new Set<string>()

    for (const id of world.query(TransformComponent, LightComponent)) {
      alive.add(id.value)

      const root = sync.getObject3D(id)
      const rawLight = world.getComponent(id, LightComponent)
      if (!root || !rawLight) continue
      const lightData = LightSchema.parse(rawLight)

      let entry = this.entries.get(id.value)
      if (!entry || entry.lightType !== lightData.type) {
        if (entry) this.removeEntry(id.value)
        entry = { ...ensureOverlay(root), lightType: lightData.type }
        this.entries.set(id.value, entry)
      }

      const isSelected = options.selectedId === id.value
      const show = options.visible

      entry.overlay.visible = show
      entry.icon.visible = show
      entry.settings.visible = show
      updateSettingsGeometry(entry, lightData)

      if (isSelected) {
        entry.settingsMaterial.color.set(0x74c0fc)
        entry.settingsMaterial.opacity = 1
        entry.settingsInnerMaterial.color.set(0x69db7c)
        entry.settingsInnerMaterial.opacity = 1
        entry.pickMaterial.color.set(0x3d5afe)
        entry.pickMaterial.opacity = 0.22
      } else {
        entry.settingsMaterial.color.set(0xffcc66)
        entry.settingsMaterial.opacity = 0.65
        entry.settingsInnerMaterial.color.set(0x69db7c)
        entry.settingsInnerMaterial.opacity = 0.85
        entry.pickMaterial.color.set(0xffcc66)
        entry.pickMaterial.opacity = 0.08
      }
    }

    for (const id of [...this.entries.keys()]) {
      if (!alive.has(id)) this.removeEntry(id)
    }
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) {
      this.removeEntry(id)
    }
  }

  private removeEntry(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return

    entry.settings.geometry.dispose()
    entry.settingsInner.geometry.dispose()
    entry.settingsMaterial.dispose()
    entry.settingsInnerMaterial.dispose()
    entry.overlay.removeFromParent()
    this.entries.delete(id)
  }
}
