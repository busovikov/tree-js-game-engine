import type { AssetId } from '@haku/schema'
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { countObject3DMeshes, modelLog, modelLogError, modelLogUrl } from './model-log.js'

/** Browser path to bundled Draco decoder (see `apps/playground/public/draco/gltf/`). */
const DEFAULT_DRACO_DECODER_PATH = '/draco/gltf/'

export interface ModelAssetLocation {
  readonly path: string
  readonly url: string
}

export type ModelAssetResolver = (assetId: AssetId) => ModelAssetLocation
export type ModelResourceResolver = (modelAssetId: AssetId, resourceFileName: string) => string
export type ModelLoadPreparer = (assetId: AssetId) => Promise<void>

const cache = new Map<string, Promise<THREE.Object3D>>()

let dracoDecoderPath = DEFAULT_DRACO_DECODER_PATH
let dracoLoader: DRACOLoader | null = null

export function setDracoDecoderPath(path: string): void {
  dracoDecoderPath = path.replace(/\/?$/, '/')
  dracoLoader?.dispose()
  dracoLoader = null
}

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(dracoDecoderPath)
    dracoLoader.preload()
  }
  return dracoLoader
}

let resolveModelAsset: ModelAssetResolver = (id) => {
  throw new Error(`Model asset resolver is not configured for ID: ${id}`)
}

let resolveModelResourceUrl: ModelResourceResolver | null = null
let prepareModelLoad: ModelLoadPreparer | null = null

export function setModelAssetResolver(resolver: ModelAssetResolver): void {
  resolveModelAsset = resolver
}

export function setModelResourceResolver(resolver: ModelResourceResolver | null): void {
  resolveModelResourceUrl = resolver
}

export function setModelLoadPreparer(preparer: ModelLoadPreparer | null): void {
  prepareModelLoad = preparer
}

export function clearModelCache(): void {
  cache.clear()
}

function resourcePathForUrl(url: string): string | null {
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
    return null
  }
  const slash = url.lastIndexOf('/')
  return slash >= 0 ? url.slice(0, slash + 1) : null
}

function isGltfRelativeResourceName(name: string): boolean {
  return /\.(bin|gltf|glb|png|jpe?g|webp|ktx2?)$/i.test(name)
}

/** Three.js may pass `model.bin`, `blob:…/model.bin`, or `/assets/models/model.bin`. */
function extractGltfResourceFileName(resourceUrl: string): string | null {
  if (resourceUrl.startsWith('data:')) return null

  const fileName = resourceUrl.split('/').pop() ?? resourceUrl
  if (!isGltfRelativeResourceName(fileName)) return null

  if (resourceUrl.startsWith('blob:')) {
    return fileName
  }

  if (
    resourceUrl.startsWith('http://') ||
    resourceUrl.startsWith('https://') ||
    resourceUrl.startsWith('/')
  ) {
    return fileName
  }

  return resourceUrl
}

function resolveGltfResourceUrl(
  assetId: AssetId,
  resourceUrl: string,
  resourcePath: string | null,
): string {
  const fileName = extractGltfResourceFileName(resourceUrl)
  if (fileName && resolveModelResourceUrl) {
    return resolveModelResourceUrl(assetId, fileName)
  }

  if (resourcePath && !resourceUrl.startsWith('/') && !resourceUrl.startsWith('http')) {
    return `${resourcePath}${resourceUrl}`
  }

  return resourceUrl
}

function loadGltfScene(assetId: AssetId): Promise<THREE.Object3D> {
  const { path: relativeAssetPath, url } = resolveModelAsset(assetId)
  const loader = new GLTFLoader()
  loader.setDRACOLoader(getDracoLoader())
  const resourcePath = resourcePathForUrl(url)

  modelLog('gltf.load.start', {
    relativeAssetPath,
    url: modelLogUrl(url),
    resourcePath,
    hasResourceResolver: !!resolveModelResourceUrl,
  })

  loader.manager.setURLModifier((resourceUrl) => {
    const resolved = resolveGltfResourceUrl(assetId, resourceUrl, resourcePath)

    if (resolved !== resourceUrl) {
      modelLog('gltf.resource.resolve', {
        relativeAssetPath,
        resourceUrl,
        resolved: modelLogUrl(resolved),
      })
    }

    return resolved
  })

  return new Promise<THREE.Object3D>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        modelLog('gltf.load.success', {
          relativeAssetPath,
          meshCount: countObject3DMeshes(gltf.scene),
          childCount: gltf.scene.children.length,
        })
        resolve(gltf.scene)
      },
      undefined,
      (error) => {
        modelLogError('gltf.load.failed', { relativeAssetPath, url: modelLogUrl(url) }, error)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

export function resolveModelAssetPath(assetId: AssetId): string {
  return resolveModelAsset(assetId).path
}

export async function loadModelTemplate(assetId: AssetId): Promise<THREE.Object3D> {
  const key = assetId

  let pending = cache.get(key)
  if (pending) {
    modelLog('template.cache.hit', { relativeAssetPath: key })
  } else {
    modelLog('template.cache.miss', { relativeAssetPath: key, hasPreparer: !!prepareModelLoad })
    pending = (async () => {
      if (prepareModelLoad) {
        modelLog('template.prepare.start', { relativeAssetPath: key })
        await prepareModelLoad(key)
        modelLog('template.prepare.done', { relativeAssetPath: key })
      }
      return loadGltfScene(key)
    })().catch((error) => {
      cache.delete(key)
      modelLogError('template.load.failed', { relativeAssetPath: key }, error)
      throw error
    })
    cache.set(key, pending)
  }

  const template = await pending
  modelLog('template.clone', {
    relativeAssetPath: key,
    meshCount: countObject3DMeshes(template),
  })
  return template.clone(true)
}

export function applyMaterialToObject(
  root: THREE.Object3D,
  apply: (material: THREE.Material) => void,
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    let transparent = false
    for (const material of materials) {
      if ('color' in material) {
        apply(material)
      }
      if (material.transparent) transparent = true
    }
    child.renderOrder = transparent ? 1 : 0
  })
}
