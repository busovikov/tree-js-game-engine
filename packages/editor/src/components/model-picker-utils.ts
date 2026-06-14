export function groupModelAssetsByFolder(assets: readonly string[]): Array<{ folder: string; files: string[] }> {
  const groups = new Map<string, string[]>()

  for (const asset of assets) {
    const slash = asset.lastIndexOf('/')
    const folder = slash === -1 ? 'Root' : asset.slice(0, slash)
    const bucket = groups.get(folder) ?? []
    bucket.push(asset)
    groups.set(folder, bucket)
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, files]) => ({
      folder,
      files: [...files].sort((a, b) => a.localeCompare(b)),
    }))
}

export function filterModelAssets(assets: readonly string[], query: string): string[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return [...assets]
  return assets.filter((asset) => asset.toLowerCase().includes(normalized))
}

export function modelAssetFileName(assetPath: string): string {
  const slash = assetPath.lastIndexOf('/')
  return slash === -1 ? assetPath : assetPath.slice(slash + 1)
}
