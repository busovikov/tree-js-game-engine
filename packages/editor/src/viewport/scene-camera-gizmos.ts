import type { EntityId, IWorld } from '@haku/core'
import { CameraComponent, TransformComponent } from '@haku/core'
import * as THREE from 'three'
import { EditorCameraFrustumHelper } from './camera-frustum-helper.js'

const OVERLAY_NAME = 'haku-camera-overlay'

interface CameraSyncAccess {
  getObject3D(entityId: EntityId): THREE.Object3D | undefined
  getEntityCamera(entityId: EntityId): THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined
}

interface CameraGizmoEntry {
  frustum: EditorCameraFrustumHelper
  overlay: THREE.Group
  icon: THREE.Object3D
  pickMesh: THREE.Mesh
  pickMaterial: THREE.MeshBasicMaterial
}

export interface SceneCameraGizmosOptions {
  visible: boolean
  selectedId: string | null
  viewportCameraId: string | null
  hideActiveViewportFrustum: boolean
}

function createCameraIcon(): THREE.Object3D {
  const material = new THREE.LineBasicMaterial({
    color: 0xaaccff,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  })
  const group = new THREE.Group()

  const body = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.24, 0.16, 0.12)),
    material,
  )
  body.position.z = 0.04
  body.renderOrder = 1000
  group.add(body)

  const lens = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.ConeGeometry(0.09, 0.14, 4)),
    material,
  )
  lens.rotation.x = -Math.PI / 2
  lens.position.z = -0.1
  lens.renderOrder = 1000
  group.add(lens)

  return group
}

function ensureOverlay(root: THREE.Object3D): Omit<CameraGizmoEntry, 'frustum'> {
  const existing = root.getObjectByName(OVERLAY_NAME)
  if (existing instanceof THREE.Group) {
    const pickMesh = existing.getObjectByName('pick')
    const icon = existing.children.find((child) => child.name !== 'pick')
    if (pickMesh instanceof THREE.Mesh && icon && pickMesh.material instanceof THREE.MeshBasicMaterial) {
      pickMesh.userData.hakuEditorPickTarget = true
      return {
        overlay: existing,
        icon,
        pickMesh,
        pickMaterial: pickMesh.material,
      }
    }
  }

  const overlay = new THREE.Group()
  overlay.name = OVERLAY_NAME
  overlay.userData.hakuEditorOverlay = true

  const icon = createCameraIcon()
  overlay.add(icon)

  const pickMaterial = new THREE.MeshBasicMaterial({
    color: 0x6699cc,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    depthTest: false,
  })
  const pickMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), pickMaterial)
  pickMesh.name = 'pick'
  pickMesh.userData.hakuEditorPickTarget = true
  pickMesh.renderOrder = 999
  overlay.add(pickMesh)

  root.add(overlay)
  return { overlay, icon, pickMesh, pickMaterial }
}

export class SceneCameraGizmos {
  private readonly entries = new Map<string, CameraGizmoEntry>()

  sync(world: IWorld, sync: CameraSyncAccess, options: SceneCameraGizmosOptions): void {
    const alive = new Set<string>()

    for (const id of world.query(TransformComponent, CameraComponent)) {
      alive.add(id.value)

      const root = sync.getObject3D(id)
      const camera = sync.getEntityCamera(id)
      if (!root || !(camera instanceof THREE.PerspectiveCamera)) continue

      let entry = this.entries.get(id.value)
      if (!entry || entry.frustum.camera !== camera) {
        if (entry) this.removeEntry(id.value)

        const frustum = new EditorCameraFrustumHelper(camera)
        const overlayParts = ensureOverlay(root)

        entry = { frustum, ...overlayParts }
        this.entries.set(id.value, entry)
      }

      const isSelected = options.selectedId === id.value
      const isViewportCamera = options.viewportCameraId === id.value
      const show = options.visible
      const showFrustum = show && !(options.hideActiveViewportFrustum && isViewportCamera)

      entry.frustum.visible = showFrustum
      entry.overlay.visible = show
      entry.icon.visible = show
      entry.frustum.updateGeometry()

      if (isSelected) {
        entry.frustum.setStyle(0x3d5afe, 1)
        entry.pickMaterial.color.set(0x3d5afe)
        entry.pickMaterial.opacity = 0.25
      } else if (isViewportCamera) {
        entry.frustum.setStyle(0x4caf50, 0.9)
        entry.pickMaterial.color.set(0x4caf50)
        entry.pickMaterial.opacity = 0.15
      } else {
        entry.frustum.setStyle(0x6699cc, 0.75)
        entry.pickMaterial.color.set(0x6699cc)
        entry.pickMaterial.opacity = 0.08
      }
    }

    for (const id of [...this.entries.keys()]) {
      if (!alive.has(id)) this.removeEntry(id)
    }
  }

  /** Keep frustum geometry in sync after viewport resize or camera param edits. */
  refreshProjections(): void {
    for (const entry of this.entries.values()) {
      if (entry.frustum.visible) {
        entry.frustum.updateGeometry()
      }
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

    entry.frustum.disposeHelper()
    entry.overlay.removeFromParent()
    this.entries.delete(id)
  }
}
