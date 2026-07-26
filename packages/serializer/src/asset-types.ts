import {
  PREFAB_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  collectAssetReferences,
  type AssetRegistry,
  type AssetTypeDescriptor,
} from '@haku/assets'
import {
  PrefabDefinitionSchema,
  SceneDocumentSchema,
  type PrefabDefinition,
  type SceneDocument,
} from '@haku/schema'

export const SCENE_ASSET_DESCRIPTOR = {
  type: SCENE_ASSET_TYPE,
  name: 'Scene',
  schema: SceneDocumentSchema,
  dependencies: collectAssetReferences,
} satisfies AssetTypeDescriptor<SceneDocument>

export const PREFAB_ASSET_DESCRIPTOR = {
  type: PREFAB_ASSET_TYPE,
  name: 'Prefab',
  schema: PrefabDefinitionSchema,
  dependencies: collectAssetReferences,
} satisfies AssetTypeDescriptor<PrefabDefinition>

export function registerSerializedAssetTypes(registry: AssetRegistry): void {
  registry.register(SCENE_ASSET_DESCRIPTOR)
  registry.register(PREFAB_ASSET_DESCRIPTOR)
}
