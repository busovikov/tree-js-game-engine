import type { Object3D, Vector3 } from 'three'
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

/** Dampens uniform XYZ scale drag to feel closer to single-axis handles. */
export const UNIFORM_SCALE_DRAG_FACTOR = 0.3

function axisScaleRatio(current: number, start: number): number | null {
  if (start === 0) return null
  return current / start
}

/** Keeps proportions while dragging any scale handle when uniform lock is enabled. */
export function applyLockedUniformScale(
  object: Object3D,
  startScale: Vector3,
  axis: string | null | undefined,
): void {
  const handle = axis ?? ''
  const ratio =
    (handle.includes('X') ? axisScaleRatio(object.scale.x, startScale.x) : null) ??
    (handle.includes('Y') ? axisScaleRatio(object.scale.y, startScale.y) : null) ??
    (handle.includes('Z') ? axisScaleRatio(object.scale.z, startScale.z) : null)

  if (ratio === null) return

  object.scale.set(
    startScale.x * ratio,
    startScale.y * ratio,
    startScale.z * ratio,
  )
}

export function shouldTrackUniformScaleDrag(
  mode: string,
  axis: string | null | undefined,
  uniformScaleLocked: boolean,
): boolean {
  return mode === 'scale' && (uniformScaleLocked || axis === 'XYZ')
}

export function applyScaleGizmoConstraint(
  object: Object3D,
  startScale: Vector3,
  axis: string | null | undefined,
  uniformScaleLocked: boolean,
): void {
  if (uniformScaleLocked) {
    applyLockedUniformScale(object, startScale, axis)
    return
  }
  if (axis === 'XYZ') {
    applyUniformScaleDamping(object, startScale)
  }
}

export function applyUniformScaleDamping(object: Object3D, startScale: Vector3, factor = UNIFORM_SCALE_DRAG_FACTOR): void {
  object.scale.set(
    startScale.x + (object.scale.x - startScale.x) * factor,
    startScale.y + (object.scale.y - startScale.y) * factor,
    startScale.z + (object.scale.z - startScale.z) * factor,
  )
}

type GizmoLayer = 'gizmo' | 'picker'

interface TransformControlsGizmoRoot {
  gizmo: Record<string, Object3D>
  picker: Record<string, Object3D>
}

function removeHandles(group: Object3D | undefined, names: Set<string>): void {
  if (!group) return

  for (const child of [...group.children]) {
    if (!names.has(child.name)) continue
    group.remove(child)
    disposeObject3D(child)
  }
}

function disposeObject3D(object: Object3D): void {
  object.traverse((node) => {
    const mesh = node as Object3D & {
      geometry?: { dispose(): void }
      material?: { dispose(): void } | Array<{ dispose(): void }>
    }

    mesh.geometry?.dispose()

    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) material.dispose()
    } else {
      mesh.material?.dispose()
    }
  })
}

/** Editor layout: translate = arrows + planes only; scale = axes + uniform center cube. */
export function applyEditorTransformGizmoLayout(gizmo: TransformControls): void {
  const root = (gizmo as unknown as { _gizmo: TransformControlsGizmoRoot })._gizmo
  const translateHidden = new Set(['XYZ'])
  const scaleHidden = new Set(['XY', 'YZ', 'XZ'])

  for (const layer of ['gizmo', 'picker'] as GizmoLayer[]) {
    removeHandles(root[layer].translate, translateHidden)
    removeHandles(root[layer].scale, scaleHidden)
  }
}
