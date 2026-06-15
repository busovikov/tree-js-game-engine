import type { EntityId, World } from '@haku/core'
import { TransformComponent } from '@haku/core'
import type { Transform } from '@haku/schema'
import * as THREE from 'three'
import { collectSelectionWorldAabb } from './aabb-snap.js'

export interface EntityDragSnapshot {
  id: EntityId
  before: Transform
  startWorldMatrix: THREE.Matrix4
}

const _box = new THREE.Box3()
const _entityBox = new THREE.Box3()
const _center = new THREE.Vector3()
const _position = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _deltaMatrix = new THREE.Matrix4()
const _nextWorld = new THREE.Matrix4()
const _parentInverse = new THREE.Matrix4()

export class SelectionTransformPivot {
  readonly object = new THREE.Object3D()
  private readonly startPivotMatrix = new THREE.Matrix4()
  private readonly startPivotWorld = new THREE.Vector3()
  private readonly startSelectionBounds = new THREE.Box3()
  private hasStartSelectionBounds = false
  private dragSnapshots: EntityDragSnapshot[] = []

  constructor() {
    this.object.name = 'haku-selection-pivot'
  }

  dispose(): void {
    this.object.removeFromParent()
  }

  isDragging(): boolean {
    return this.dragSnapshots.length > 0
  }

  /** Place pivot at the shared center of all selected objects. */
  syncCenter(
    ids: readonly EntityId[],
    getObject3D: (id: EntityId) => THREE.Object3D | undefined,
  ): void {
    if (ids.length === 0) return

    _box.makeEmpty()
    let hasPoint = false

    for (const id of ids) {
      const object3d = getObject3D(id)
      if (!object3d) continue

      object3d.updateMatrixWorld(true)
      _entityBox.setFromObject(object3d)
      if (_entityBox.isEmpty()) {
        object3d.getWorldPosition(_center)
        _box.expandByPoint(_center)
      } else {
        _box.union(_entityBox)
      }
      hasPoint = true
    }

    if (!hasPoint) return

    _box.getCenter(_center)
    this.object.position.copy(_center)
    this.object.quaternion.identity()
    this.object.scale.set(1, 1, 1)
    this.object.updateMatrixWorld(true)
  }

  beginDrag(
    ids: readonly EntityId[],
    world: World,
    getObject3D: (id: EntityId) => THREE.Object3D | undefined,
  ): EntityDragSnapshot[] {
    this.object.updateMatrixWorld(true)
    this.startPivotMatrix.copy(this.object.matrixWorld)
    this.object.getWorldPosition(this.startPivotWorld)
    this.hasStartSelectionBounds = false

    const bounds = collectSelectionWorldAabb(ids, getObject3D)
    if (bounds) {
      this.startSelectionBounds.copy(bounds)
      this.hasStartSelectionBounds = true
    }

    this.dragSnapshots = []

    for (const id of ids) {
      const object3d = getObject3D(id)
      if (!object3d || !world.hasComponent(id, TransformComponent)) continue

      const before = world.getComponent(id, TransformComponent)
      if (!before) continue

      object3d.updateMatrixWorld(true)
      this.dragSnapshots.push({
        id,
        before: structuredClone(before),
        startWorldMatrix: object3d.matrixWorld.clone(),
      })
    }

    return this.dragSnapshots
  }

  applyDrag(
    world: World,
    getObject3D: (id: EntityId) => THREE.Object3D | undefined,
  ): void {
    if (this.dragSnapshots.length === 0) return

    this.object.updateMatrixWorld(true)
    _deltaMatrix.copy(this.object.matrixWorld).multiply(this.startPivotMatrix.clone().invert())

    for (const snapshot of this.dragSnapshots) {
      const object3d = getObject3D(snapshot.id)
      if (!object3d) continue

      _nextWorld.multiplyMatrices(_deltaMatrix, snapshot.startWorldMatrix)

      if (object3d.parent) {
        object3d.parent.updateMatrixWorld(true)
        _parentInverse.copy(object3d.parent.matrixWorld).invert()
        _nextWorld.premultiply(_parentInverse)
      }

      _nextWorld.decompose(_position, _quaternion, _scale)
      object3d.position.copy(_position)
      object3d.quaternion.copy(_quaternion)
      object3d.scale.copy(_scale)
      object3d.updateMatrixWorld(true)

      world.addComponent(snapshot.id, TransformComponent, {
        position: [_position.x, _position.y, _position.z],
        rotation: [_quaternion.x, _quaternion.y, _quaternion.z, _quaternion.w],
        scale: [_scale.x, _scale.y, _scale.z],
      })
    }
  }

  endDrag(): EntityDragSnapshot[] {
    const snapshots = this.dragSnapshots
    this.dragSnapshots = []
    this.hasStartSelectionBounds = false
    return snapshots
  }

  getSnapDragState(): {
    startBounds: THREE.Box3
    startPivotWorld: THREE.Vector3
  } | null {
    if (!this.hasStartSelectionBounds || this.dragSnapshots.length === 0) return null
    return {
      startBounds: this.startSelectionBounds,
      startPivotWorld: this.startPivotWorld,
    }
  }
}

export function focusSelectionBounds(
  ids: readonly EntityId[],
  getObject3D: (id: EntityId) => THREE.Object3D | undefined,
  camera: THREE.PerspectiveCamera,
  orbit: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls,
): void {
  _box.makeEmpty()
  let hasPoint = false

  for (const id of ids) {
    const object3d = getObject3D(id)
    if (!object3d) continue

    object3d.updateMatrixWorld(true)
    _entityBox.setFromObject(object3d)
    if (_entityBox.isEmpty()) {
      object3d.getWorldPosition(_center)
      _box.expandByPoint(_center)
    } else {
      _box.union(_entityBox)
    }
    hasPoint = true
  }

  if (!hasPoint) return

  _box.getCenter(_center)
  const size = _box.getSize(new THREE.Vector3())
  const radius = Math.max(size.length() * 0.5, 0.5)

  orbit.target.copy(_center)

  const offset = new THREE.Vector3().subVectors(camera.position, orbit.target)
  if (offset.lengthSq() < 1e-6) offset.set(1, 0.75, 1)
  offset.normalize().multiplyScalar(Math.max(radius * 2.5, 2))

  camera.position.copy(_center).add(offset)
  orbit.update()
}
