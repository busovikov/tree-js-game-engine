import * as THREE from 'three'

function dimHex(hex: number): number {
  const color = new THREE.Color(hex)
  const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b
  return new THREE.Color(luminance * 0.45, luminance * 0.45, luminance * 0.45).getHex()
}

export function setObjectEditorDimmed(root: THREE.Object3D, dimmed: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return

    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      if (material.userData.hakuOriginalColor === undefined) {
        material.userData.hakuOriginalColor = material.color.getHex()
      }
      material.color.setHex(
        dimmed ? dimHex(material.userData.hakuOriginalColor) : material.userData.hakuOriginalColor,
      )
    }
  })
}
