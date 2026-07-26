import { AssetRegistry, registerBuiltinAssetTypes } from '@haku/assets'
import { registerSerializedAssetTypes } from '@haku/serializer'

export function createEngineAssetRegistry(): AssetRegistry {
  const registry = new AssetRegistry()
  registerBuiltinAssetTypes(registry)
  registerSerializedAssetTypes(registry)
  return registry
}
