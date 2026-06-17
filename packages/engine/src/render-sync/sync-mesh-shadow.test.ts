import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { normalizeMeshRenderer } from '@haku/schema'
import { syncMeshShadowFlags } from './sync-mesh-shadow.js'

describe('syncMeshShadowFlags', () => {
  it('sets castShadow and receiveShadow on child meshes', () => {
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    group.add(mesh)

    const renderer = normalizeMeshRenderer({
      castShadow: false,
      receiveShadow: true,
    })
    syncMeshShadowFlags(group, renderer)

    expect(mesh.castShadow).toBe(false)
    expect(mesh.receiveShadow).toBe(true)
  })
})
