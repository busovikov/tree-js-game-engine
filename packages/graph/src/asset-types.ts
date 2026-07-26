import {
  assetTypeId,
  collectAssetReferences,
  type AssetRegistry,
  type AssetTypeDescriptor,
} from '@haku/assets'
import {
  GraphAssetSchema,
  type GraphAsset,
} from './graph-schema.js'

export const GRAPH_ASSET_TYPE = assetTypeId('20000000-0000-4000-8000-000000000007')

export const GRAPH_ASSET_DESCRIPTOR = {
  type: GRAPH_ASSET_TYPE,
  name: 'Graph',
  schema: GraphAssetSchema,
  dependencies: collectAssetReferences,
} satisfies AssetTypeDescriptor<GraphAsset>

export function registerGraphAssetTypes(registry: AssetRegistry): void {
  registry.register(GRAPH_ASSET_DESCRIPTOR)
}
