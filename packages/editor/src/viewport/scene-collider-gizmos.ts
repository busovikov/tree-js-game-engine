import type { EntityId, IWorld } from '@haku/core'
import { ColliderComponent, VehicleComponent } from '@haku/core'
import type { Collider } from '@haku/schema'
import { vehicleChassisCollider } from '@haku/engine'
import * as THREE from 'three'
import { applyEditorLineMaterial, applyEditorOverlayObject } from './editor-overlay-style.js'

const OVERLAY_NAME = 'haku-collider-overlay'

interface ColliderSyncAccess {
  getObject3D(entityId: EntityId): THREE.Object3D | undefined
}

export interface SceneColliderGizmosOptions {
  visible: boolean
  selectedIds: ReadonlySet<string>
}

interface ColliderGizmoEntry {
  lines: THREE.LineSegments
  shapeKey: string
}

function shapeGeometryKey(collider: Collider): string {
  switch (collider.shape) {
    case 'box':
      return `box:${collider.halfExtents.join(',')}`
    case 'sphere':
      return `sphere:${collider.radius}`
    case 'capsule':
      return `capsule:${collider.radius}:${collider.halfHeight}`
  }
}

function createWireframeGeometry(collider: Collider): THREE.BufferGeometry {
  switch (collider.shape) {
    case 'box':
      return new THREE.EdgesGeometry(
        new THREE.BoxGeometry(
          collider.halfExtents[0] * 2,
          collider.halfExtents[1] * 2,
          collider.halfExtents[2] * 2,
        ),
      )
    case 'sphere':
      return new THREE.EdgesGeometry(new THREE.SphereGeometry(collider.radius, 16, 12))
    case 'capsule':
      return new THREE.EdgesGeometry(
        new THREE.CapsuleGeometry(collider.radius, collider.halfHeight * 2, 4, 12),
      )
  }
}

function createColliderWireframe(collider: Collider): THREE.LineSegments {
  const geometry = createWireframeGeometry(collider)
  const material = new THREE.LineBasicMaterial({ color: 0x00e676 })
  applyEditorLineMaterial(material, { transparent: true, opacity: 0.95 })
  const lines = new THREE.LineSegments(geometry, material)
  lines.name = OVERLAY_NAME
  lines.userData.hakuEditorOverlay = true
  applyEditorOverlayObject(lines)
  return lines
}

function applyColliderLocalTransform(lines: THREE.Object3D, collider: Collider): void {
  const [ox, oy, oz] = collider.offset
  lines.position.set(ox, oy, oz)
  const [qx, qy, qz, qw] = collider.rotation
  lines.quaternion.set(qx, qy, qz, qw)
}

function disposeLineSegments(lines: THREE.LineSegments): void {
  lines.geometry.dispose()
  const material = lines.material
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
  } else {
    material.dispose()
  }
}

export class SceneColliderGizmos {
  private readonly entries = new Map<string, ColliderGizmoEntry>()

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.lines.removeFromParent()
      disposeLineSegments(entry.lines)
    }
    this.entries.clear()
  }

  sync(world: IWorld, sync: ColliderSyncAccess, options: SceneColliderGizmosOptions): void {
    const alive = new Set<string>()

    for (const id of world.getAllEntities()) {
      if (!options.selectedIds.has(id.value)) continue

      const vehicle = world.getComponent(id, VehicleComponent)
      const explicitCollider = world.getComponent(id, ColliderComponent)
      const collider: Collider | null = vehicle
        ? vehicleChassisCollider(vehicle)
        : explicitCollider ?? null
      if (!collider) continue

      const object3d = sync.getObject3D(id)
      if (!object3d) continue
      alive.add(id.value)

      const shapeKey = shapeGeometryKey(collider)
      let entry = this.entries.get(id.value)
      if (!entry || entry.shapeKey !== shapeKey) {
        if (entry) {
          entry.lines.removeFromParent()
          disposeLineSegments(entry.lines)
        }
        const lines = createColliderWireframe(collider)
        object3d.add(lines)
        entry = { lines, shapeKey }
        this.entries.set(id.value, entry)
      }

      entry.lines.visible = options.visible
      applyColliderLocalTransform(entry.lines, collider)
    }

    for (const [entityId, entry] of this.entries) {
      if (alive.has(entityId)) continue
      entry.lines.removeFromParent()
      disposeLineSegments(entry.lines)
      this.entries.delete(entityId)
    }
  }
}
