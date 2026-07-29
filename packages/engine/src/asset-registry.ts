import {
  AssetRegistry,
  PREFAB_ASSET_TYPE,
  registerBuiltinAssetTypes,
  type ProjectManifest,
} from '@haku/assets'
import { registerAudioAssetTypes } from '@haku/audio'
import { registerSerializedAssetTypes } from '@haku/serializer'
import { registerGraphAssetTypes } from '@haku/graph'
import { registerUIAssetTypes } from '@haku/ui'
import {
  projectPathToUrl,
  type AssetId,
  type PrefabDefinition,
} from '@haku/schema'

export function createEngineAssetRegistry(): AssetRegistry {
  const registry = new AssetRegistry()
  registerBuiltinAssetTypes(registry)
  registerSerializedAssetTypes(registry)
  registerGraphAssetTypes(registry)
  registerUIAssetTypes(registry)
  registerAudioAssetTypes(registry)
  return registry
}

export type AssetJsonFetch = (path: string) => Promise<{
  ok: boolean
  json(): Promise<unknown>
}>

const defaultAssetJsonFetch: AssetJsonFetch = (path) => fetch(path)

export async function loadProjectPrefabAssets(
  manifest: ProjectManifest,
  fetchAsset: AssetJsonFetch = defaultAssetJsonFetch,
): Promise<Map<AssetId, PrefabDefinition>> {
  const descriptor = createEngineAssetRegistry().require(PREFAB_ASSET_TYPE)
  const prefabs = new Map<AssetId, PrefabDefinition>()
  for (const entry of manifest.assets) {
    if (entry.type !== PREFAB_ASSET_TYPE) continue
    const path = projectPathToUrl(`${manifest.assetsDir}/${entry.path}`)
    const response = await fetchAsset(path)
    if (!response.ok) throw new Error(`Failed to load prefab asset: ${path}`)
    prefabs.set(
      entry.id,
      descriptor.schema.parse(await response.json()) as PrefabDefinition,
    )
  }
  return prefabs
}
