import type { EntityId, IWorld } from '@haku/core'
import { ColliderComponent } from '@haku/core'
import type { Collider } from '@haku/schema'
import * as THREE from 'three'
import { applyEditorOverlayObject } from './editor-overlay-style.js'

export type ResizableColliderShape = 'box' | 'sphere' | 'capsule'

export function isResizableColliderShape(shape: Collider['shape']): shape is ResizableColliderShape {
  return shape === 'box' || shape === 'sphere' || shape === 'capsule'
}

interface ColliderResizeSyncAccess {
  getObject3D(entityId: EntityId): THREE.Object3D | undefined
}

export class SceneColliderResizeGizmo {
  readonly proxy = new THREE.Object3D()
  private attachedEntityId: string | null = null

  constructor() {
    this.proxy.name = 'haku-collider-resize-proxy'
    applyEditorOverlayObject(this.proxy)
  }

  dispose(): void {
    this.proxy.removeFromParent()
  }

  sync(
    world: IWorld,
    sync: ColliderResizeSyncAccess,
    entityId: EntityId | null,
    active: boolean,
  ): THREE.Object3D | null {
    if (!entityId || !active) {
      this.proxy.visible = false
      this.attachedEntityId = null
      return null
    }

    const collider = world.getComponent(entityId, ColliderComponent)
    if (!collider || !isResizableColliderShape(collider.shape)) {
      this.proxy.visible = false
      this.attachedEntityId = null
      return null
    }

    const object3d = sync.getObject3D(entityId)
    if (!object3d) {
      this.proxy.visible = false
      this.attachedEntityId = null
      return null
    }

    if (this.proxy.parent !== object3d) {
      object3d.add(this.proxy)
    }

    this.attachedEntityId = entityId.value
    this.proxy.visible = true
    const [ox, oy, oz] = collider.offset
    this.proxy.position.set(ox, oy, oz)
    const [qx, qy, qz, qw] = collider.rotation
    this.proxy.quaternion.set(qx, qy, qz, qw)

    switch (collider.shape) {
      case 'box':
        this.proxy.scale.set(
          collider.halfExtents[0] * 2,
          collider.halfExtents[1] * 2,
          collider.halfExtents[2] * 2,
        )
        break
      case 'sphere': {
        const diameter = collider.radius * 2
        this.proxy.scale.set(diameter, diameter, diameter)
        break
      }
      case 'capsule': {
        const diameter = collider.radius * 2
        const height = collider.halfHeight * 2 + diameter
        this.proxy.scale.set(diameter, height, diameter)
        break
      }
    }

    return this.proxy
  }

  applyScaleToCollider(collider: Collider, scale: THREE.Vector3): Collider {
    if (!isResizableColliderShape(collider.shape)) {
      return collider
    }

    switch (collider.shape) {
      case 'box':
        return {
          ...collider,
          halfExtents: [
            Math.max(0.001, Math.abs(scale.x) / 2),
            Math.max(0.001, Math.abs(scale.y) / 2),
            Math.max(0.001, Math.abs(scale.z) / 2),
          ],
        }
      case 'sphere': {
        const radius = Math.max(
          0.001,
          Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) / 2,
        )
        return { ...collider, radius }
      }
      case 'capsule': {
        const radius = Math.max(0.001, Math.max(Math.abs(scale.x), Math.abs(scale.z)) / 2)
        const halfHeight = Math.max(0, (Math.abs(scale.y) - radius * 2) / 2)
        return { ...collider, radius, halfHeight }
      }
    }
  }

  getAttachedEntityId(): string | null {
    return this.attachedEntityId
  }
}
