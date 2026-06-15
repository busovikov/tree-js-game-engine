import * as THREE from 'three'

const WIREFRAME_OVERLAY_NAME = 'haku-wireframe-overlay'

export function syncWireframeOverlay(root: THREE.Object3D, enabled: boolean, color: string): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (child.userData.hakuEditorOverlay && !child.userData.hakuEditorPickTarget) return
    if (!child.geometry?.attributes?.position) return

    let overlay = child.getObjectByName(WIREFRAME_OVERLAY_NAME) as THREE.LineSegments | undefined
    const materials = Array.isArray(child.material) ? child.material : [child.material]

    if (enabled) {
      if (!overlay) {
        child.updateWorldMatrix(true, false)
        const edges = new THREE.EdgesGeometry(child.geometry, 15)
        const lineMaterial = new THREE.LineBasicMaterial({
          color: new THREE.Color(color),
          toneMapped: false,
        })
        overlay = new THREE.LineSegments(edges, lineMaterial)
        overlay.name = WIREFRAME_OVERLAY_NAME
        overlay.userData.hakuEditorOverlay = true
        overlay.renderOrder = 2
        overlay.frustumCulled = false
        child.add(overlay)
      } else {
        overlay.visible = true
        ;(overlay.material as THREE.LineBasicMaterial).color.set(color)
      }

      for (const material of materials) {
        material.visible = false
      }
      return
    }

    if (overlay) overlay.visible = false
    for (const material of materials) {
      material.visible = true
    }
  })
}
