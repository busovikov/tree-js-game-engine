/** Project-relative assets directory on disk (under Vite `public/`). */
export const DEFAULT_ASSETS_DIR = 'public/assets'

/** Convert a project-relative path to a browser fetch URL. */
export function projectPathToUrl(path: string): string {
  const normalized = path.replace(/^\/+/, '')
  const withoutPublic = normalized.startsWith('public/') ? normalized.slice('public/'.length) : normalized
  return `/${withoutPublic}`
}

/** Path inside the assets root, or null when `assetPath` is outside it. */
export function relativeToAssetsDir(assetPath: string, assetsDir = DEFAULT_ASSETS_DIR): string | null {
  const normalized = assetPath.replace(/^\/+/, '').replace(/\\/g, '/')
  const root = assetsDir.replace(/\/+$/, '')
  const prefix = `${root}/`
  if (!normalized.startsWith(prefix)) return null
  const relativePath = normalized.slice(prefix.length)
  return relativePath || null
}
