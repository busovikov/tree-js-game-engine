#!/usr/bin/env node
/**
 * Propose static box colliders from rc-level.glb (AD-03 mode B).
 * Usage: node .agents/tools/propose-level-colliders.mjs [path/to/rc-level.glb]
 */
globalThis.self = globalThis

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCALE = 3
const OFFSET_Y = 2
const COLLIDER_PATTERNS =
  /^(box|ramp|kicker|bank|quarter|corner|tunnel|loop|pyramid|cube)_/i

const defaultGlb =
  process.argv[2] ??
  join(dirname(fileURLToPath(import.meta.url)), '../../tmp-js-game-project/public/assets/models/rc-level.glb')

const buf = readFileSync(defaultGlb)
const loader = new GLTFLoader()
const gltf = await new Promise((resolve, reject) => {
  loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', resolve, reject)
})

const scene = gltf.scene
scene.scale.setScalar(SCALE)
scene.position.y = OFFSET_Y
scene.updateMatrixWorld(true)

const meshes = []
scene.traverse((child) => {
  if (!child.isMesh || !child.geometry?.attributes?.position) return
  const pos = child.geometry.attributes.position
  const v = new THREE.Vector3()
  const box = new THREE.Box3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld)
    box.expandByPoint(v)
  }
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  if (Math.max(size.x, size.y, size.z) < 2) return
  if (!COLLIDER_PATTERNS.test(child.name)) return
  if (box.max.y < 1.5) return
  meshes.push({ name: child.name, center, size, box })
})

meshes.sort((a, b) => a.name.localeCompare(b.name))

let idCounter = 100
function nextId() {
  idCounter += 1
  const hex = idCounter.toString(16).padStart(4, '0')
  return `c1000000-0000-4000-8000-${hex.padStart(12, '0')}`
}

const groundCollider = {
  id: 'c1000000-0000-4000-8000-000000000004',
  name: 'GroundCollider',
  parent: null,
  components: [
    {
      type: 'Transform',
      data: {
        position: [0, 2, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    },
    {
      type: 'Collider',
      data: {
        shape: 'box',
        halfExtents: [120, 0.15, 120],
        isStatic: true,
        offset: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
    },
  ],
}

const colliderEntities = meshes.map((mesh) => ({
  id: nextId(),
  name: `Collider_${mesh.name}`,
  parent: null,
  components: [
    {
      type: 'Transform',
      data: {
        position: mesh.center.toArray().map((v) => +v.toFixed(3)),
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    },
    {
      type: 'Collider',
      data: {
        shape: 'box',
        halfExtents: mesh.size
          .clone()
          .multiplyScalar(0.5)
          .toArray()
          .map((v) => +v.toFixed(3)),
        isStatic: true,
        offset: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
    },
  ],
}))

const outPath = process.argv[3]
const payload = { groundCollider, colliderEntities, count: colliderEntities.length }
if (outPath) {
  writeFileSync(outPath, JSON.stringify(payload, null, 2))
  console.log(`Wrote ${colliderEntities.length} colliders + ground to ${outPath}`)
} else {
  console.log(JSON.stringify(payload, null, 2))
}
