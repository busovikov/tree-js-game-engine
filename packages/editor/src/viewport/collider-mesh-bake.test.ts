import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  bakeColliderMeshFromObject3D,
  hullContainsSourceAabb,
  isBakeSourceStale,
  meshRevisionForRenderer,
} from './collider-mesh-bake.js'

function makeLShapeMesh(): THREE.Object3D {
  const group = new THREE.Group()
  const barA = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.5))
  barA.position.set(0, 0, 0)
  const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2))
  barB.position.set(0.75, 0, 0.75)
  group.add(barA, barB)
  group.updateMatrixWorld(true)
  return group
}

describe('collider mesh bake', () => {
  it('convex bake produces a hull from dense source mesh', () => {
    const source = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24))
    const root = new THREE.Group()
    root.add(source)
    root.updateMatrixWorld(true)

    const result = bakeColliderMeshFromObject3D(root, 'convexHull')
    expect(result).not.toBeNull()
    expect(result!.points!.length).toBeGreaterThanOrEqual(12)
    expect(result!.sourceVertexCount).toBeGreaterThan(0)
    expect(result!.points!.length / 3).toBeGreaterThanOrEqual(4)
  })

  it('convex hull contains the source mesh AABB', () => {
    const root = makeLShapeMesh()
    const merged = bakeColliderMeshFromObject3D(root, 'trimesh')
    expect(merged).not.toBeNull()

    const hull = bakeColliderMeshFromObject3D(root, 'convexHull')
    expect(hull).not.toBeNull()
    expect(hullContainsSourceAabb(merged!.vertices!, hull!.points!)).toBe(true)
  })

  it('bakes trimesh vertices and indices', () => {
    const root = makeLShapeMesh()
    const result = bakeColliderMeshFromObject3D(root, 'trimesh')
    expect(result?.vertices?.length).toBeGreaterThan(0)
    expect(result?.indices?.length).toBeGreaterThan(0)
    expect((result?.indices?.length ?? 0) % 3).toBe(0)
  })

  it('tracks mesh revision staleness', () => {
    const revision = meshRevisionForRenderer({
      geometryType: 'BoxGeometry',
      geometryParams: { width: 1, height: 1, depth: 1 },
      modelAsset: '',
      material: {},
      castShadow: true,
      receiveShadow: true,
      enabled: true,
    })
    expect(
      isBakeSourceStale({ kind: 'meshRenderer', meshRevision: revision }, revision),
    ).toBe(false)
    expect(
      isBakeSourceStale(
        { kind: 'meshRenderer', meshRevision: revision },
        `${revision}-changed`,
      ),
    ).toBe(true)
  })
})
