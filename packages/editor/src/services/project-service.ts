import { HakuProjectSchema, type HakuProject, type PrefabDefinition, type SceneDocument, DEFAULT_ASSETS_DIR, projectPathToUrl, relativeToAssetsDir } from '@haku/schema'
import { loadSceneDocument, saveSceneDocument } from '@haku/serializer'
import type { EntityId, IWorld } from '@haku/core'
import { MeshRendererComponent, World, getCoreComponent } from '@haku/core'
import { clearModelCache, modelLog, modelLogError, modelLogUrl, sceneLog, sceneLogError } from '@haku/engine'
import { browserProjectStore } from './browser-project-store.js'
import { isFileSystemAccessSupported, nativeProjectStore } from './native-project-store.js'
import { loadPersonalizedProjectTemplate } from './project-template.js'

export interface ProjectFileEntry {
  path: string
  name: string
  isDirectory: boolean
}

type ProjectStorage = 'memory' | 'native' | 'playground'

const PROJECT_LOG_PATH = 'logs/haku.log'

export class ProjectService {
  private root: string | null = null
  private manifest: HakuProject | null = null
  private assetBaseUrl = ''
  private storage: ProjectStorage = 'memory'
  private modelBlobUrlCache = new Map<string, string>()

  isFileSystemAccessSupported(): boolean {
    return isFileSystemAccessSupported()
  }

  usesNativeFileSystem(): boolean {
    return this.storage === 'native'
  }

  isVirtualFs(): boolean {
    return this.storage === 'memory' || this.storage === 'playground'
  }

  private usesBrowserProjectStore(): boolean {
    return this.storage === 'memory' || this.storage === 'playground'
  }

  canSyncAssetsToDisk(): boolean {
    return this.storage === 'playground' || this.storage === 'native'
  }

  /** Create a new project folder on disk and open it. */
  async createNewProject(): Promise<HakuProject> {
    if (!isFileSystemAccessSupported()) {
      throw new Error('File System Access API is not supported in this browser. Use Chrome or Edge.')
    }

    // Directory picker must run before prompt() to keep the browser user gesture.
    const projectHandle = await nativeProjectStore.pickProjectDirectory()
    const projectName = prompt('Project name', projectHandle.name || 'my-game')?.trim()
    if (!projectName) {
      throw new DOMException('Project creation cancelled', 'AbortError')
    }

    const templateFiles = await loadPersonalizedProjectTemplate(projectName)
    await nativeProjectStore.scaffoldProject(projectHandle, templateFiles)

    this.storage = 'native'
    this.root = projectHandle.name
    this.assetBaseUrl = ''
    this.clearModelAssetCache()

    const manifestRaw = await nativeProjectStore.readText('haku.project.json')
    this.manifest = await this.normalizeManifest(HakuProjectSchema.parse(JSON.parse(manifestRaw)))

    sceneLog('project.open', { source: 'native-create', root: projectHandle.name, entryScene: this.manifest.entryScene })
    const { world, document } = await this.loadScene(this.manifest.entryScene)
    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().setProjectRoot(projectHandle.name)
    useEditorStore.getState().setScene(this.manifest.entryScene, document, world as World)

    return this.manifest
  }

  /** Open project via File System Access API (read/write on disk). */
  async openFromDirectoryPicker(): Promise<HakuProject> {
    if (!isFileSystemAccessSupported()) {
      throw new Error('File System Access API is not supported in this browser. Use Chrome or Edge.')
    }

    const rootName = await nativeProjectStore.openDirectoryPicker()
    this.storage = 'native'
    this.root = rootName
    this.assetBaseUrl = ''
    this.clearModelAssetCache()

    const manifestRaw = await nativeProjectStore.readText('haku.project.json')
    this.manifest = await this.normalizeManifest(HakuProjectSchema.parse(JSON.parse(manifestRaw)))

    sceneLog('project.open', { source: 'native', root: rootName, entryScene: this.manifest.entryScene })
    const { world, document } = await this.loadScene(this.manifest.entryScene)
    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().setProjectRoot(rootName)
    useEditorStore.getState().setScene(this.manifest.entryScene, document, world as World)

    return this.manifest
  }

  /** Fallback: open project from folder picker (read-only snapshot in memory). */
  async openFromFileList(fileList: FileList): Promise<HakuProject> {
    const rootName = browserProjectStore.loadFromFileList(fileList)
    this.storage = 'memory'
    this.root = rootName
    this.assetBaseUrl = ''
    this.clearModelAssetCache()

    const manifestRaw = await browserProjectStore.readText('haku.project.json')
    this.manifest = await this.normalizeManifest(HakuProjectSchema.parse(JSON.parse(manifestRaw)))

    sceneLog('project.open', { source: 'memory', root: rootName, entryScene: this.manifest.entryScene })
    const { world, document } = await this.loadScene(this.manifest.entryScene)
    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().setProjectRoot(rootName)
    useEditorStore.getState().setScene(this.manifest.entryScene, document, world as World)

    return this.manifest
  }

  openFromManifest(rootPath: string, manifest: HakuProject, assetBaseUrl = ''): HakuProject {
    this.root = rootPath
    this.manifest = manifest
    this.assetBaseUrl = assetBaseUrl
    this.storage = rootPath === 'playground' ? 'playground' : 'memory'
    this.clearModelAssetCache()
    sceneLog('project.open', { source: rootPath === 'playground' ? 'playground' : 'manifest', root: rootPath, entryScene: manifest.entryScene })
    return manifest
  }

  getRoot(): string | null {
    return this.root
  }

  getManifest(): HakuProject | null {
    return this.manifest
  }

  async loadScene(relativePath: string): Promise<{ world: IWorld; document: SceneDocument }> {
    sceneLog('load.start', {
      path: relativePath,
      storage: this.storage,
      root: this.root,
    })

    try {
      let document: SceneDocument

      if (this.storage === 'native') {
        const raw = await nativeProjectStore.readText(relativePath)
        sceneLog('load.read', { path: relativePath, source: 'native', bytes: raw.length })
        document = JSON.parse(raw) as SceneDocument
      } else if (this.storage === 'memory' || this.storage === 'playground') {
        const raw = await browserProjectStore.readText(relativePath)
        sceneLog('load.read', { path: relativePath, source: 'browser-store', bytes: raw.length })
        document = JSON.parse(raw) as SceneDocument
      } else {
        const url = `${this.assetBaseUrl}/${relativePath}`.replace(/\/+/g, '/')
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Failed to load scene: ${url}`)
        sceneLog('load.read', { path: relativePath, source: 'http', url, status: res.status })
        document = (await res.json()) as SceneDocument
      }

      const world = loadSceneDocument(document, { expandPrefabs: false })
      sceneLog('load.success', {
        path: relativePath,
        name: document.metadata?.name,
        entityCount: world.getAllEntities().length,
        prefabCount: Object.keys(document.prefabs ?? {}).length,
        prototypeCount: Object.keys(document.prototypes ?? {}).length,
      })
      return { world, document }
    } catch (error) {
      sceneLogError('load.failed', { path: relativePath, storage: this.storage }, error)
      throw error
    }
  }

  async appendProjectLog(text: string): Promise<void> {
    const path = PROJECT_LOG_PATH

    if (this.storage === 'native') {
      let existing = ''
      try {
        existing = await nativeProjectStore.readText(path)
      } catch {
        existing = ''
      }
      await nativeProjectStore.writeText(path, existing + text)
      return
    }

    if (this.usesBrowserProjectStore()) {
      let existing = ''
      if (browserProjectStore.has(path)) {
        existing = await browserProjectStore.readText(path)
      }
      browserProjectStore.writeText(path, existing + text)

      if (this.storage === 'playground') {
        void this.syncPlaygroundLogToDisk(text)
      }
    }
  }

  private async syncPlaygroundLogToDisk(text: string): Promise<void> {
    try {
      await fetch('/__haku/log/append', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: text,
      })
    } catch {
      // Playground log sync is best-effort during local dev.
    }
  }

  async saveScene(relativePath: string, world: IWorld, document: SceneDocument): Promise<SceneDocument> {
    const saved = saveSceneDocument(world, document.metadata, document.prototypes, document.prefabs)
    const json = JSON.stringify(saved, null, 2) + '\n'

    sceneLog('save.start', { path: relativePath, storage: this.storage })

    if (this.storage === 'native') {
      await nativeProjectStore.writeText(relativePath, json)
    } else if (this.storage === 'memory' || this.storage === 'playground') {
      browserProjectStore.writeText(relativePath, json)
      if (this.storage === 'playground') {
        await this.writePlaygroundFileToDisk(relativePath, json)
      }
    }

    sceneLog('save.success', { path: relativePath, storage: this.storage, bytes: json.length })

    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().setScene(relativePath, saved, world as World)

    return saved
  }

  updateSceneDocument(document: SceneDocument): void {
    import('../store/editor-store.js').then(({ useEditorStore }) => {
      const world = useEditorStore.getState().world
      if (world) {
        useEditorStore.getState().setScene(useEditorStore.getState().scenePath ?? '', document, world)
      }
    })
  }

  getSceneDocument(): SceneDocument | null {
    return null
  }

  async listDirectory(relativeDir: string): Promise<ProjectFileEntry[]> {
    if (!this.manifest) return []

    const assetsRoot = this.manifest.assetsDir
    const dir = relativeDir || assetsRoot

    if (dir !== assetsRoot && !dir.startsWith(`${assetsRoot}/`)) {
      return []
    }

    if (this.storage === 'native') {
      return nativeProjectStore.listDirectory(dir)
    }

    return browserProjectStore.listDirectory(dir)
  }

  async seedVirtualAssets(entries: Array<{ path: string; url: string }>): Promise<void> {
    this.storage = 'playground'
    for (const entry of entries) {
      await browserProjectStore.registerFromUrl(entry.path, entry.url)
    }
  }

  async seedVirtualAssetsFromManifest(manifestUrl: string, assetsDir?: string): Promise<void> {
    const root = assetsDir ?? this.getAssetsRoot()
    this.storage = 'playground'
    browserProjectStore.clear()

    sceneLog('assets.seed.start', { manifestUrl, assetsRoot: root })

    try {
      const res = await fetch(manifestUrl)
      if (!res.ok) throw new Error(`Failed to load asset manifest: ${manifestUrl}`)

      const manifest = (await res.json()) as { files?: string[] }
      const files = manifest.files ?? []
      const baseUrl = manifestUrl.slice(0, manifestUrl.lastIndexOf('/'))

      sceneLog('assets.seed.manifest', { manifestUrl, fileCount: files.length })

      for (const relativePath of files) {
        const path = `${root}/${relativePath.replace(/^\/+/, '')}`
        const url = `${baseUrl}/${relativePath.replace(/^\/+/, '')}`
        await browserProjectStore.registerFromUrl(path, url)
      }

      sceneLog('assets.seed.success', { manifestUrl, fileCount: files.length })
    } catch (error) {
      sceneLogError('assets.seed.failed', { manifestUrl, assetsRoot: root }, error)
      throw error
    }
  }

  async resyncVirtualAssetsFromManifest(manifestUrl = '/assets/manifest.json', assetsDir?: string): Promise<void> {
    if (this.storage !== 'playground') return
    const root = assetsDir ?? this.getAssetsRoot()
    browserProjectStore.removeUnderPrefix(root)
    await this.seedVirtualAssetsFromManifest(manifestUrl, root)
  }

  async importAsset(relativePath: string, file: File): Promise<void> {
    if (this.storage === 'native') {
      await nativeProjectStore.writeFile(relativePath, file)
      return
    }

    browserProjectStore.registerFile(relativePath, { file, isBinary: isBinaryFile(file.name) })

    if (this.storage !== 'playground') return

    await this.writePlaygroundFileToDisk(relativePath, file)
  }

  async createDirectory(relativePath: string): Promise<void> {
    if (!this.manifest) throw new Error('No project open')

    const assetsRoot = this.manifest.assetsDir
    const dir = relativePath.replace(/^\/+/, '').replace(/\/+$/, '')

    if (dir !== assetsRoot && !dir.startsWith(`${assetsRoot}/`)) {
      throw new Error(`Directory must be under ${assetsRoot}/`)
    }

    if (this.storage === 'native') {
      await nativeProjectStore.createDirectory(dir)
      return
    }

    browserProjectStore.createDirectory(dir)

    if (this.storage === 'playground') {
      await this.writePlaygroundFileToDisk(`${dir}/.gitkeep`, '')
    }
  }

  /** @deprecated Use importAsset */
  importVirtualAsset(relativePath: string, file: File): void {
    void this.importAsset(relativePath, file)
  }

  getEntryScene(): string | null {
    return this.manifest?.entryScene ?? null
  }

  getAssetsRoot(): string {
    return this.manifest?.assetsDir ?? DEFAULT_ASSETS_DIR
  }

  clearModelAssetCache(): void {
    modelLog('cache.clear', { entries: this.modelBlobUrlCache.size })
    for (const url of this.modelBlobUrlCache.values()) {
      URL.revokeObjectURL(url)
    }
    this.modelBlobUrlCache.clear()
    clearModelCache()
  }

  async prepareModelLoad(relativePath: string): Promise<void> {
    const normalized = relativePath.replace(/^\/+/, '')
    const assetsRoot = this.getAssetsRoot()
    const fullPath = `${assetsRoot}/${normalized}`

    modelLog('prepare.start', { relativePath, fullPath, storage: this.storage, assetsRoot })

    await this.ensureModelBlobUrl(fullPath)

    const ext = normalized.split('.').pop()?.toLowerCase()
    if (ext !== 'gltf') {
      modelLog('prepare.done', { relativePath, format: ext ?? 'unknown', resources: 0 })
      return
    }

    const gltfJson = await this.readModelGltfJson(fullPath)
    const modelDir = normalized.includes('/')
      ? normalized.slice(0, normalized.lastIndexOf('/') + 1)
      : ''

    const uris = new Set<string>()
    for (const buffer of gltfJson.buffers ?? []) {
      if (typeof buffer.uri === 'string' && buffer.uri && !buffer.uri.startsWith('data:')) {
        uris.add(buffer.uri)
      }
    }
    for (const image of gltfJson.images ?? []) {
      if (typeof image.uri === 'string' && image.uri && !image.uri.startsWith('data:')) {
        uris.add(image.uri)
      }
    }

    modelLog('prepare.gltf-resources', { relativePath, resources: [...uris] })

    await Promise.all(
      [...uris].map((uri) => this.ensureModelBlobUrl(`${assetsRoot}/${modelDir}${uri}`)),
    )

    modelLog('prepare.done', { relativePath, format: 'gltf', resources: uris.size })
  }

  resolveModelAssetUrl(relativePath: string): string {
    const assetsRoot = this.getAssetsRoot()
    const fullPath = `${assetsRoot}/${relativePath.replace(/^\/+/, '')}`

    if (this.assetBaseUrl) {
      const url = `${this.assetBaseUrl}/${relativePath}`.replace(/\/+/g, '/')
      modelLog('resolve.asset', { relativePath, fullPath, storage: this.storage, source: 'asset-base-url', url })
      return url
    }

    const cached = this.modelBlobUrlCache.get(fullPath)
    if (cached) {
      modelLog('resolve.asset', {
        relativePath,
        fullPath,
        storage: this.storage,
        source: 'blob-cache',
        url: modelLogUrl(cached),
      })
      return cached
    }

    if (this.usesBrowserProjectStore()) {
      const blobUrl = this.trySyncModelBlobUrl(fullPath)
      if (blobUrl) {
        modelLog('resolve.asset', {
          relativePath,
          fullPath,
          storage: this.storage,
          source: 'blob-sync',
          url: modelLogUrl(blobUrl),
        })
        return blobUrl
      }
    }

    const fallback = projectPathToUrl(fullPath)
    modelLog('resolve.asset', {
      relativePath,
      fullPath,
      storage: this.storage,
      source: 'http-fallback',
      url: fallback,
    })
    return fallback
  }

  resolveModelResourceUrl(modelRelativePath: string, resourceFileName: string): string {
    const assetsRoot = this.getAssetsRoot()
    const modelDir = modelRelativePath.includes('/')
      ? modelRelativePath.slice(0, modelRelativePath.lastIndexOf('/') + 1)
      : ''
    const fullPath = `${assetsRoot}/${modelDir}${resourceFileName.replace(/^\/+/, '')}`

    if (this.assetBaseUrl) {
      const relative = relativeToAssetsDir(fullPath, assetsRoot)
      if (relative) {
        const url = `${this.assetBaseUrl}/${relative}`.replace(/\/+/g, '/')
        modelLog('resolve.resource', {
          modelRelativePath,
          resourceFileName,
          fullPath,
          storage: this.storage,
          source: 'asset-base-url',
          url,
        })
        return url
      }
    }

    const cached = this.modelBlobUrlCache.get(fullPath)
    if (cached) {
      modelLog('resolve.resource', {
        modelRelativePath,
        resourceFileName,
        fullPath,
        storage: this.storage,
        source: 'blob-cache',
        url: modelLogUrl(cached),
      })
      return cached
    }

    if (this.usesBrowserProjectStore()) {
      const blobUrl = this.trySyncModelBlobUrl(fullPath)
      if (blobUrl) {
        modelLog('resolve.resource', {
          modelRelativePath,
          resourceFileName,
          fullPath,
          storage: this.storage,
          source: 'blob-sync',
          url: modelLogUrl(blobUrl),
        })
        return blobUrl
      }
    }

    const fallback = projectPathToUrl(fullPath)
    modelLog('resolve.resource', {
      modelRelativePath,
      resourceFileName,
      fullPath,
      storage: this.storage,
      source: 'http-fallback',
      url: fallback,
    })
    return fallback
  }

  private trySyncModelBlobUrl(fullPath: string): string | null {
    if (!this.usesBrowserProjectStore()) return null

    const entry = browserProjectStore.getFile(fullPath)
    if (!entry) return null

    try {
      const blob = entry.file ?? (entry.content !== undefined ? new Blob([entry.content]) : null)
      if (!blob) return null
      return this.cacheModelBlobUrl(fullPath, blob)
    } catch {
      return null
    }
  }

  private cacheModelBlobUrl(fullPath: string, file: File | Blob): string {
    const existing = this.modelBlobUrlCache.get(fullPath)
    if (existing) return existing
    const url = URL.createObjectURL(file)
    this.modelBlobUrlCache.set(fullPath, url)
    return url
  }

  private async writePlaygroundFileToDisk(relativePath: string, body: string | Blob): Promise<void> {
    const res = await fetch('/__haku/assets/import', {
      method: 'POST',
      headers: { 'X-Haku-Asset-Path': relativePath },
      body: typeof body === 'string' ? new Blob([body], { type: 'application/json' }) : body,
    })

    if (!res.ok) {
      const message = await res.text()
      throw new Error(message || `Failed to write file to disk: ${relativePath}`)
    }
  }

  private async importPlaygroundAssetFromHttp(fullPath: string): Promise<void> {
    const url = projectPathToUrl(fullPath)
    modelLog('playground.import', { fullPath, url })
    await browserProjectStore.registerFromUrl(fullPath, url)
  }

  private async ensureModelBlobUrl(fullPath: string): Promise<string> {
    const cached = this.modelBlobUrlCache.get(fullPath)
    if (cached) {
      modelLog('blob.cache-hit', { fullPath, storage: this.storage, url: modelLogUrl(cached) })
      return cached
    }

    if (this.usesBrowserProjectStore()) {
      if (!browserProjectStore.getFile(fullPath)?.file && this.storage === 'playground') {
        await this.importPlaygroundAssetFromHttp(fullPath)
      }

      const entry = browserProjectStore.getFile(fullPath)
      if (!entry) {
        modelLogError('blob.missing', { fullPath, storage: this.storage, source: 'browser-store' })
        throw new Error(`Model asset not found: ${fullPath}`)
      }

      const blob = entry.file ?? (entry.content !== undefined ? new Blob([entry.content]) : null)
      if (!blob) {
        modelLogError('blob.missing', { fullPath, storage: this.storage, source: 'browser-store' })
        throw new Error(`Model asset not found: ${fullPath}`)
      }

      const url = this.cacheModelBlobUrl(fullPath, blob)
      modelLog('blob.created', { fullPath, storage: this.storage, source: 'browser-store', url: modelLogUrl(url) })
      return url
    }

    if (this.storage === 'native') {
      const file = await nativeProjectStore.getFile(fullPath)
      const url = this.cacheModelBlobUrl(fullPath, file)
      modelLog('blob.created', {
        fullPath,
        storage: this.storage,
        source: 'native',
        url: modelLogUrl(url),
        bytes: file.size,
      })
      return url
    }

    modelLogError('blob.unsupported-storage', { fullPath, storage: this.storage })
    throw new Error(`Cannot load model asset: ${fullPath}`)
  }

  private async readModelGltfJson(
    fullPath: string,
  ): Promise<{ buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> }> {
    if (this.storage === 'native') {
      const text = await nativeProjectStore.readText(fullPath)
      return JSON.parse(text) as { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> }
    }

    if (this.usesBrowserProjectStore()) {
      const text = await browserProjectStore.readText(fullPath)
      return JSON.parse(text) as { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> }
    }

    throw new Error(`Cannot read glTF: ${fullPath}`)
  }

  async listModelAssets(): Promise<string[]> {
    if (!this.manifest) return []

    const assetsRoot = this.getAssetsRoot()
    const models: string[] = []
    const queue = [assetsRoot]

    while (queue.length > 0) {
      const dir = queue.shift()!
      const entries = await this.listDirectory(dir)
      for (const entry of entries) {
        if (entry.isDirectory) {
          queue.push(entry.path)
          continue
        }
        const ext = entry.name.split('.').pop()?.toLowerCase()
        if (ext !== 'glb' && ext !== 'gltf') continue
        const relative = relativeToAssetsDir(entry.path, assetsRoot)
        if (relative) models.push(relative)
      }
    }

    return models.sort((a, b) => a.localeCompare(b))
  }

  /** Upgrade legacy `assets/` manifest paths to on-disk `public/assets/`. */
  private async normalizeManifest(manifest: HakuProject): Promise<HakuProject> {
    if (manifest.assetsDir !== 'assets') return manifest

    const upgraded: HakuProject = {
      ...manifest,
      assetsDir: DEFAULT_ASSETS_DIR,
      entryScene: manifest.entryScene.startsWith('assets/')
        ? manifest.entryScene.replace(/^assets\//, `${DEFAULT_ASSETS_DIR}/`)
        : manifest.entryScene,
    }

    if (this.storage !== 'native') return upgraded

    try {
      await nativeProjectStore.readText(upgraded.entryScene)
      return upgraded
    } catch {
      return manifest
    }
  }
}

function isBinaryFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'glb' || ext === 'bin' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp'
}

export const projectService = new ProjectService()

export function extractPrefabSubtree(
  world: IWorld,
  rootId: EntityId,
  prefabId: string,
): PrefabDefinition {
  const collect = (id: EntityId): EntityId[] => {
    const result = [id]
    for (const child of world.getChildren(id)) {
      result.push(...collect(child))
    }
    return result
  }

  const ids = collect(rootId)
  const idSet = new Set(ids.map((i) => i.value))

  const entities = ids.map((id) => ({
    id: id.value,
    name: world.getEntityName(id) ?? 'Entity',
    parent: (() => {
      const p = world.getParent(id)
      if (!p) return null
      return idSet.has(p.value) ? p.value : null
    })(),
    components: world.getComponentTypes(id).flatMap((typeId) => {
      const type = getCoreComponent(typeId)
      if (!type || typeId === 'PrefabInstance') return []
      const data = world.getComponent(id, type)
      return data !== undefined ? [{ type: typeId, data: data as Record<string, unknown> }] : []
    }),
  }))

  return { id: prefabId, entities }
}

export function assignPrototype(
  document: SceneDocument,
  prototypeId: string,
  sourceAsset: string,
): SceneDocument {
  return {
    ...document,
    prototypes: {
      ...document.prototypes,
      [prototypeId]: { id: prototypeId, mode: 'mesh', sourceAsset },
    },
  }
}

export function assignMeshPrototype(world: IWorld, targetId: EntityId, meshRenderer: import('@haku/schema').MeshRenderer): void {
  world.addComponent(targetId, MeshRendererComponent, meshRenderer)
}
