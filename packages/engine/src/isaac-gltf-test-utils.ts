import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const require = createRequire(import.meta.url)
const threeGltfLoader = require.resolve('three/examples/jsm/loaders/GLTFLoader.js')
const LOCAL_DRACO_DECODER_PATH = join(dirname(threeGltfLoader), '../libs/draco/gltf/')

let dracoLoader: DRACOLoader | null = null

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(`${pathToFileURL(LOCAL_DRACO_DECODER_PATH).href}/`)
  }
  return dracoLoader
}

export function repoPlaygroundAssetPath(relativePath: string): string {
  return join(process.cwd(), '../../apps/playground/public/assets', relativePath)
}

export async function loadPlaygroundGltfScene(relativePath: string): Promise<THREE.Object3D> {
  const absolute = repoPlaygroundAssetPath(relativePath)
  const buffer = readFileSync(absolute)
  const loader = new GLTFLoader()
  if (relativePath.includes('-draco')) {
    loader.setDRACOLoader(getDracoLoader())
  }
  const gltf = await loader.parseAsync(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    '',
  )
  return gltf.scene
}

export function objectSize(root: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
}
