import type { ProjectFileEntry } from '../services/project-service.js'

export type AssetKind = 'directory' | 'model' | 'scene' | 'image' | 'prefab' | 'other'

export function fileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return '📁'
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'glb' || ext === 'gltf') return '🎲'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return '🖼'
  if (name.endsWith('.scene.json') || ext === 'json') return '📋'
  return '📄'
}

export function getAssetKind(entry: ProjectFileEntry | null | undefined): AssetKind {
  if (!entry) return 'other'
  if (entry.isDirectory) return 'directory'
  const name = entry.name.toLowerCase()
  if (name.endsWith('.scene.json')) return 'scene'
  if (name.endsWith('.prefab.json')) return 'prefab'
  const ext = name.split('.').pop()
  if (ext === 'glb' || ext === 'gltf') return 'model'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'image'
  return 'other'
}

export function isValidFolderName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Folder name is required'
  if (trimmed.includes('/') || trimmed.includes('\\')) return 'Folder name cannot contain slashes'
  if (trimmed === '.' || trimmed === '..') return 'Invalid folder name'
  return null
}

export function suggestDuplicateName(originalName: string, existingNames: Set<string>): string {
  const dot = originalName.lastIndexOf('.')
  const base = dot > 0 ? originalName.slice(0, dot) : originalName
  const ext = dot > 0 ? originalName.slice(dot) : ''

  let candidate = `${base} copy${ext}`
  if (!existingNames.has(candidate)) return candidate

  for (let i = 2; i < 1000; i++) {
    candidate = `${base} copy ${i}${ext}`
    if (!existingNames.has(candidate)) return candidate
  }

  return `${base} copy ${Date.now()}${ext}`
}

export function matchesAssetFilter(entry: ProjectFileEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return entry.name.toLowerCase().includes(normalized)
}

export interface AssetSearchIndex {
  query: string
  dirsWithMatches: Set<string>
  dirsVisibleInTree: Set<string>
  firstDirWithMatches: string | null
}

export function buildAssetSearchIndex(
  allFiles: ReadonlyArray<Pick<ProjectFileEntry, 'path' | 'name'>>,
  query: string,
  assetsRoot: string,
): AssetSearchIndex {
  const normalizedQuery = query.trim().toLowerCase()
  const dirsWithMatches = new Set<string>()
  const dirsVisibleInTree = new Set<string>([assetsRoot])

  if (!normalizedQuery) {
    return {
      query: normalizedQuery,
      dirsWithMatches,
      dirsVisibleInTree,
      firstDirWithMatches: null,
    }
  }

  for (const file of allFiles) {
    if (!matchesAssetFilter(file as ProjectFileEntry, normalizedQuery)) continue

    const parent = parentDirectory(file.path, assetsRoot)
    dirsWithMatches.add(parent)

    let dir = parent
    while (dir.startsWith(assetsRoot)) {
      dirsVisibleInTree.add(dir)
      if (dir === assetsRoot) break
      dir = parentDirectory(dir, assetsRoot)
    }
  }

  const firstDirWithMatches = [...dirsWithMatches].sort((a, b) => a.localeCompare(b))[0] ?? null

  return {
    query: normalizedQuery,
    dirsWithMatches,
    dirsVisibleInTree,
    firstDirWithMatches,
  }
}

export function isValidAssetName(name: string, isDirectory: boolean): string | null {
  if (isDirectory) return isValidFolderName(name)
  const trimmed = name.trim()
  if (!trimmed) return 'Name is required'
  if (trimmed.includes('/') || trimmed.includes('\\')) return 'Name cannot contain slashes'
  if (trimmed === '.' || trimmed === '..') return 'Invalid name'
  return null
}

export function parentDirectory(path: string, fallback: string): string {
  if (!path.includes('/')) return fallback
  const parent = path.slice(0, path.lastIndexOf('/'))
  return parent || fallback
}
