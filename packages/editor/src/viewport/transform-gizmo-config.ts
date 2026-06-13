import type { Object3D } from 'three'
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

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
