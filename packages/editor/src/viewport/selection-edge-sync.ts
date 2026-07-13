import * as THREE from 'three'

const SELECTION_EDGE_NAME = 'haku-selection-edge'
const EDGE_THRESHOLD_ANGLE = 15

/** Crisp mesh-edge highlight for selected entities — no OutlinePass smear. */
export class SelectionEdgeSync {
  private readonly edgesByRoot = new Map<THREE.Object3D, THREE.LineSegments[]>()

  setTargets(targets: readonly THREE.Object3D[]): void {
    const next = new Set(targets)

    for (const [root, lines] of this.edgesByRoot) {
      if (next.has(root)) continue
      this.removeEdges(root, lines)
      this.edgesByRoot.delete(root)
    }

    for (const root of targets) {
      if (this.edgesByRoot.has(root)) continue
      this.edgesByRoot.set(root, this.attachEdges(root))
    }
  }

  dispose(): void {
    for (const [root, lines] of this.edgesByRoot) {
      this.removeEdges(root, lines)
    }
    this.edgesByRoot.clear()
  }

  private attachEdges(root: THREE.Object3D): THREE.LineSegments[] {
    const created: THREE.LineSegments[] = []

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      if (child.getObjectByName(SELECTION_EDGE_NAME)) return
      if (!child.geometry?.attributes?.position) return

      const material = new THREE.LineBasicMaterial({
        color: 0xffc107,
        toneMapped: false,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
      })

      const lines = new THREE.LineSegments(
        new THREE.EdgesGeometry(child.geometry, EDGE_THRESHOLD_ANGLE),
        material,
      )
      lines.name = SELECTION_EDGE_NAME
      lines.userData.hakuEditorOverlay = true
      lines.renderOrder = 1002
      lines.frustumCulled = false

      child.add(lines)
      created.push(lines)
    })

    return created
  }

  private removeEdges(root: THREE.Object3D, lines: THREE.LineSegments[]): void {
    for (const line of lines) {
      line.removeFromParent()
      line.geometry.dispose()
      const material = line.material
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose())
      } else {
        material.dispose()
      }
    }

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const stale = child.getObjectByName(SELECTION_EDGE_NAME)
      if (stale) child.remove(stale)
    })
  }
}
