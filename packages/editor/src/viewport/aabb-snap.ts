import type { EntityId, World } from '@haku/core'
import { MeshRendererComponent } from '@haku/core'
import * as THREE from 'three'

const SNAP_THRESHOLD = 0.5

const _box = new THREE.Box3()
const _entityBox = new THREE.Box3()
const _worldPos = new THREE.Vector3()
const _translation = new THREE.Vector3()

function getWorldAabb(object3d: THREE.Object3D): THREE.Box3 | null {
  object3d.updateMatrixWorld(true)
  _box.setFromObject(object3d)
  return _box.isEmpty() ? null : _box.clone()
}

export function collectSelectionWorldAabb(
  ids: readonly EntityId[],
  getObject3D: (id: EntityId) => THREE.Object3D | undefined,
): THREE.Box3 | null {
  _box.makeEmpty()
  let hasPoint = false

  for (const id of ids) {
    const object3d = getObject3D(id)
    if (!object3d) continue

    object3d.updateMatrixWorld(true)
    _entityBox.setFromObject(object3d)
    if (_entityBox.isEmpty()) {
      object3d.getWorldPosition(_worldPos)
      _box.expandByPoint(_worldPos)
    } else {
      _box.union(_entityBox)
    }
    hasPoint = true
  }

  return hasPoint ? _box.clone() : null
}

function snapAxesFromGizmoAxis(axis: string | null | undefined): { x: boolean; y: boolean; z: boolean } {
  const value = axis ?? 'XYZ'
  return {
    x: value.includes('X'),
    y: value.includes('Y'),
    z: value.includes('Z'),
  }
}

function bestAxisSnap(
  sourceMin: number,
  sourceMax: number,
  targets: number[],
  threshold: number,
): number {
  let bestDelta = 0
  let bestDistance = threshold + 1

  for (const edge of [sourceMin, sourceMax]) {
    for (const target of targets) {
      const delta = target - edge
      const distance = Math.abs(delta)
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance
        bestDelta = delta
      }
    }
  }

  return bestDistance <= threshold ? bestDelta : 0
}

function collectTargetEdges(
  world: World,
  getObject3D: (id: EntityId) => THREE.Object3D | undefined,
  excludeIds: ReadonlySet<string>,
): { x: number[]; y: number[]; z: number[] } {
  const targetEdges: { x: number[]; y: number[]; z: number[] } = { x: [], y: [], z: [] }

  for (const id of world.getAllEntities()) {
    if (excludeIds.has(id.value)) continue
    if (!world.hasComponent(id, MeshRendererComponent)) continue

    const otherObject = getObject3D(id)
    if (!otherObject) continue

    const otherBox = getWorldAabb(otherObject)
    if (!otherBox) continue

    targetEdges.x.push(otherBox.min.x, otherBox.max.x)
    targetEdges.y.push(otherBox.min.y, otherBox.max.y)
    targetEdges.z.push(otherBox.min.z, otherBox.max.z)
  }

  return targetEdges
}

function snapDeltaForBox(
  draggedBox: THREE.Box3,
  targetEdges: { x: number[]; y: number[]; z: number[] },
  axis: string | null | undefined,
  threshold: number,
): THREE.Vector3 {
  if (targetEdges.x.length === 0) return new THREE.Vector3()

  const axes = snapAxesFromGizmoAxis(axis)
  return new THREE.Vector3(
    axes.x ? bestAxisSnap(draggedBox.min.x, draggedBox.max.x, targetEdges.x, threshold) : 0,
    axes.y ? bestAxisSnap(draggedBox.min.y, draggedBox.max.y, targetEdges.y, threshold) : 0,
    axes.z ? bestAxisSnap(draggedBox.min.z, draggedBox.max.z, targetEdges.z, threshold) : 0,
  )
}

function applyWorldDeltaToObject(object: THREE.Object3D, delta: THREE.Vector3): void {
  if (delta.lengthSq() === 0) return

  object.getWorldPosition(_worldPos)
  _worldPos.add(delta)

  if (object.parent) {
    object.parent.worldToLocal(_worldPos)
  }
  object.position.copy(_worldPos)
  object.updateMatrixWorld(true)
}

export function applyAabbEdgeSnap(
  object: THREE.Object3D,
  selectedId: EntityId,
  world: World,
  getObject3D: (id: EntityId) => THREE.Object3D | undefined,
  axis: string | null | undefined,
  threshold = SNAP_THRESHOLD,
): void {
  if (!world.hasComponent(selectedId, MeshRendererComponent)) return

  const draggedBox = getWorldAabb(object)
  if (!draggedBox) return

  const targetEdges = collectTargetEdges(world, getObject3D, new Set([selectedId.value]))
  const delta = snapDeltaForBox(draggedBox, targetEdges, axis, threshold)
  applyWorldDeltaToObject(object, delta)
}

/** Snap a multi-selection pivot using the combined bounds translated with the pivot. */
export function applyAabbEdgeSnapToSelectionPivot(
  pivot: THREE.Object3D,
  selectedIds: readonly EntityId[],
  startBounds: THREE.Box3,
  startPivotWorld: THREE.Vector3,
  world: World,
  getObject3D: (id: EntityId) => THREE.Object3D | undefined,
  axis: string | null | undefined,
  threshold = SNAP_THRESHOLD,
): void {
  if (selectedIds.length === 0) return

  pivot.updateMatrixWorld(true)
  pivot.getWorldPosition(_worldPos)
  _translation.copy(_worldPos).sub(startPivotWorld)

  const draggedBox = startBounds.clone()
  draggedBox.min.add(_translation)
  draggedBox.max.add(_translation)

  const exclude = new Set(selectedIds.map((id) => id.value))
  const targetEdges = collectTargetEdges(world, getObject3D, exclude)
  const delta = snapDeltaForBox(draggedBox, targetEdges, axis, threshold)

  applyWorldDeltaToObject(pivot, delta)
}
