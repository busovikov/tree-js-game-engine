import type { EntityId, IWorld } from '@haku/core'
import { MeshRendererComponent } from '@haku/core'
import * as THREE from 'three'
import { applyEditorLineMaterial, applyEditorOverlayObject } from './editor-overlay-style.js'

const OVERLAY_NAME = 'haku-aabb-overlay'

interface AabbSyncAccess {
  getObject3D(entityId: EntityId): THREE.Object3D | undefined
}

export interface SceneAabbGizmosOptions {
  visible: boolean
  selectedIds: ReadonlySet<string>
}

function createBoxHelper(): THREE.Box3Helper {
  const box = new THREE.Box3()
  const helper = new THREE.Box3Helper(box, 0x3d5afe)
  helper.name = OVERLAY_NAME
  helper.userData.hakuEditorOverlay = true
  applyEditorOverlayObject(helper)
  applyEditorLineMaterial(helper.material as THREE.LineBasicMaterial, {
    transparent: true,
    opacity: 0.75,
  })
  return helper
}

export class SceneAabbGizmos {
  private readonly helpers = new Map<string, THREE.Box3Helper>()
  private readonly root = new THREE.Group()
  private readonly tempBox = new THREE.Box3()

  constructor() {
    this.root.name = 'haku-aabb-gizmos'
    applyEditorOverlayObject(this.root)
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.root)
  }

  dispose(): void {
    for (const helper of this.helpers.values()) {
      helper.geometry.dispose()
      const material = helper.material
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose())
      } else {
        material.dispose()
      }
    }
    this.helpers.clear()
    this.root.removeFromParent()
  }

  sync(world: IWorld, sync: AabbSyncAccess, options: SceneAabbGizmosOptions): void {
    this.root.visible = options.visible
    if (!options.visible) return

    const alive = new Set<string>()

    for (const id of world.getAllEntities()) {
      if (!world.hasComponent(id, MeshRendererComponent)) continue

      const object3d = sync.getObject3D(id)
      if (!object3d) continue

      object3d.updateMatrixWorld(true)
      this.tempBox.setFromObject(object3d)
      if (this.tempBox.isEmpty()) continue

      alive.add(id.value)

      let helper = this.helpers.get(id.value)
      if (!helper) {
        helper = createBoxHelper()
        this.helpers.set(id.value, helper)
        this.root.add(helper)
      }

      helper.box.copy(this.tempBox)
      helper.updateMatrixWorld(true)

      const material = helper.material as THREE.LineBasicMaterial
      const selected = options.selectedIds.has(id.value)
      material.color.setHex(selected ? 0xffc107 : 0x3d5afe)
      material.opacity = selected ? 1 : 0.75
      material.transparent = !selected
    }

    for (const [entityId, helper] of this.helpers) {
      if (alive.has(entityId)) continue
      helper.removeFromParent()
      helper.geometry.dispose()
      const material = helper.material
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose())
      } else {
        material.dispose()
      }
      this.helpers.delete(entityId)
    }
  }
}
