import * as THREE from 'three'

export const EDITOR_OVERLAY_RENDER_ORDER = 1000

/** Keeps gizmo/overlay lines crisp and above scene geometry without z-fighting. */
export function applyEditorLineMaterial(
  material: THREE.LineBasicMaterial,
  options?: { transparent?: boolean; opacity?: number },
): void {
  material.toneMapped = false
  material.depthTest = false
  material.depthWrite = false
  if (options?.transparent !== undefined) material.transparent = options.transparent
  if (options?.opacity !== undefined) material.opacity = options.opacity
}

export function applyEditorOverlayObject(
  object: THREE.Object3D,
  renderOrder = EDITOR_OVERLAY_RENDER_ORDER,
): void {
  object.renderOrder = Math.max(object.renderOrder, renderOrder)
  object.frustumCulled = false

  object.traverse((child) => {
    child.renderOrder = Math.max(child.renderOrder, renderOrder)
    child.frustumCulled = false

    const materials = collectMaterials(child)
    for (const material of materials) {
      if (material instanceof THREE.LineBasicMaterial) {
        applyEditorLineMaterial(material)
        continue
      }
      if ('toneMapped' in material) material.toneMapped = false
      if ('depthTest' in material) material.depthTest = false
      if ('depthWrite' in material) material.depthWrite = false
    }
  })
}

function collectMaterials(object: THREE.Object3D): THREE.Material[] {
  const mesh = object as THREE.Mesh
  if (!mesh.material) return []
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}
