import { entityId, type EntityId } from '@haku/core'
import * as THREE from 'three'

const OUTLINE_NAME = 'haku-selection-outline'
const OUTLINE_COLOR = 0x6aaeff

interface OutlineSyncAccess {
  getObject3D(id: EntityId): THREE.Object3D | undefined
}

export interface SceneSelectionOutlineOptions {
  visible: boolean
  selectedIds: ReadonlySet<string>
}

function removeOutline(mesh: THREE.Mesh): void {
  const outline = mesh.getObjectByName(OUTLINE_NAME) as THREE.LineSegments | undefined
  if (!outline) return
  outline.geometry.dispose()
  const material = outline.material
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
  } else {
    material.dispose()
  }
  outline.removeFromParent()
}

function syncMeshOutline(mesh: THREE.Mesh): void {
  if (mesh.userData.hakuEditorOverlay && !mesh.userData.hakuEditorPickTarget) return
  if (!mesh.geometry?.attributes?.position) return

  let outline = mesh.getObjectByName(OUTLINE_NAME) as THREE.LineSegments | undefined
  const geometryUuid = mesh.geometry.uuid

  if (outline && outline.userData.hakuOutlineGeometryUuid !== geometryUuid) {
    removeOutline(mesh)
    outline = undefined
  }

  if (!outline) {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 15)
    const material = new THREE.LineBasicMaterial({
      color: OUTLINE_COLOR,
      toneMapped: false,
      transparent: true,
      opacity: 1,
      depthTest: true,
    })
    outline = new THREE.LineSegments(edges, material)
    outline.name = OUTLINE_NAME
    outline.userData.hakuEditorOverlay = true
    outline.userData.hakuOutlineGeometryUuid = geometryUuid
    outline.renderOrder = 1
    outline.frustumCulled = false
    mesh.add(outline)
  }

  outline.visible = true
}

export class SceneSelectionOutline {
  private readonly outlinedMeshes = new Set<THREE.Mesh>()

  sync(sync: OutlineSyncAccess, options: SceneSelectionOutlineOptions): void {
    const desiredMeshes = new Set<THREE.Mesh>()

    if (options.visible) {
      for (const id of options.selectedIds) {
        const object3d = sync.getObject3D(entityId(id))
        if (!object3d) continue

        object3d.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          syncMeshOutline(child)
          desiredMeshes.add(child)
        })
      }
    }

    for (const mesh of this.outlinedMeshes) {
      if (desiredMeshes.has(mesh)) continue
      removeOutline(mesh)
    }

    this.outlinedMeshes.clear()
    for (const mesh of desiredMeshes) {
      this.outlinedMeshes.add(mesh)
    }
  }

  dispose(): void {
    for (const mesh of this.outlinedMeshes) {
      removeOutline(mesh)
    }
    this.outlinedMeshes.clear()
  }
}
