import type { EntityId, IWorld } from '@haku/core'
import { ColliderComponent, PhysicsControllerComponent } from '@haku/core'
import { resolveColliderDescriptor } from '@haku/engine'
import type { Collider } from '@haku/schema'
import * as THREE from 'three'
import { applyEditorLineMaterial, applyEditorOverlayObject } from './editor-overlay-style.js'

const OVERLAY_NAME = 'haku-collider-overlay'

interface ColliderSyncAccess {
  getObject3D(entityId: EntityId): THREE.Object3D | undefined
}

export interface SceneColliderGizmosOptions {
  visible: boolean
  selectedIds: ReadonlySet<string>
  /** When true, draw colliders for every entity (not only the current selection). */
  showAll?: boolean
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
    case 'convexHull':
      return `convexHull:${collider.points.length}`
    case 'trimesh':
      return `trimesh:${collider.vertices.length}:${collider.indices.length}`
    default:
      return collider.shape
  }
}

function createConvexHullGeometry(points: readonly number[]): THREE.BufferGeometry | null {
  if (points.length < 9) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return geometry
}

function createTrimeshGeometry(
  vertices: readonly number[],
  indices: readonly number[],
): THREE.BufferGeometry | null {
  if (vertices.length < 9 || indices.length < 3) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex([...indices])
  return geometry
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
    case 'convexHull': {
      const source = createConvexHullGeometry(collider.points)
      const edges = source
        ? new THREE.EdgesGeometry(source)
        : new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
      source?.dispose()
      return edges
    }
    case 'trimesh': {
      const source = createTrimeshGeometry(collider.vertices, collider.indices)
      const edges = source
        ? new THREE.EdgesGeometry(source)
        : new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
      source?.dispose()
      return edges
    }
    default:
      return new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
  }
}

function createColliderWireframe(collider: Collider, implicit = false): THREE.LineSegments {
  const geometry = createWireframeGeometry(collider)
  const material = new THREE.LineBasicMaterial({ color: implicit ? 0xffab00 : 0x00e676 })
  applyEditorLineMaterial(material, { transparent: true, opacity: implicit ? 0.85 : 0.95 })
  const lines = new THREE.LineSegments(geometry, material)
  lines.name = OVERLAY_NAME
  lines.userData.hakuEditorOverlay = true
  lines.userData.hakuImplicitChassis = implicit
  lines.userData.hakuImplicitCollider = implicit
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
      const isSelected = options.selectedIds.has(id.value)
      if (!options.showAll && !isSelected) continue

      const vehicle = world.getComponent(id, PhysicsControllerComponent)
      const explicitCollider = world.getComponent(id, ColliderComponent)
      const resolved = resolveColliderDescriptor(vehicle, explicitCollider)
      if (!resolved) continue
      const { collider } = resolved
      const implicitCollider = resolved.source === 'implicit-controller'

      const object3d = sync.getObject3D(id)
      if (!object3d) continue
      alive.add(id.value)

      const shapeKey = `${implicitCollider ? 'implicit:' : 'explicit:'}${shapeGeometryKey(collider)}`
      let entry = this.entries.get(id.value)
      if (!entry || entry.shapeKey !== shapeKey) {
        if (entry) {
          entry.lines.removeFromParent()
          disposeLineSegments(entry.lines)
        }
        const lines = createColliderWireframe(collider, implicitCollider)
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
