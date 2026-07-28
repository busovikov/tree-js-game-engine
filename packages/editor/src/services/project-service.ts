import {
  EDITOR_PROJECT_SETTINGS_PATH,
  EditorProjectSettingsSchema,
  defaultEditorProjectSettings,
  defaultSceneEditorState,
  PrefabDefinitionSchema,
  type EditorProjectSettings,
  type PrefabDefinition,
  type SceneDocument,
  type SceneEditorState,
  DEFAULT_ASSETS_DIR,
  assetId,
  projectPathToUrl,
  relativeToAssetsDir,
  validateSceneDocument,
  SceneEditorStateSchema,
} from '@haku/schema'
import {
  BINARY_ASSET_TYPE,
  PREFAB_ASSET_TYPE,
  DATA_ASSET_TYPE,
  MODEL_ASSET_TYPE,
  ProjectAssetIndex,
  SCENE_ASSET_TYPE,
  TEXTURE_ASSET_TYPE,
  assetRef,
  collectAssetReferences,
  validateProjectAssetComposition,
  validateProjectManifest,
  type ProjectManifest,
} from '@haku/assets'
import type { AssetId, AssetRef, AssetTypeId } from '@haku/schema'
import { loadSceneDocument, saveSceneDocument } from '@haku/serializer'
import { PrefabInstanceComponent, type EntityId, type IWorld } from '@haku/core'
import { World } from '@haku/core'
import {
  createEngineAssetRegistry,
  createEngineComponentRegistry,
  getEngineComponent,
} from '@haku/engine'
import { MeshRendererComponent } from '@haku/engine'
import {
  clearModelCache,
  modelLog,
  modelLogError,
  modelLogUrl,
  sceneLog,
  sceneLogError,
} from '@haku/engine'
import { browserProjectStore } from './browser-project-store.js'
import { isFileSystemAccessSupported, nativeProjectStore } from './native-project-store.js'
import { loadPersonalizedProjectTemplate } from './project-template.js'
import { PLAYGROUND_PROJECT } from './playground-demos.js'
import {
  GRAPH_ASSET_TYPE,
  GraphAssetSchema,
  type GraphAsset,
} from '@haku/graph'
import type { BrowserProjectTrustMode } from '@haku/build'
import { BrowserProjectWorkspace, type BrowserProjectFileSystem } from './browser-project-workspace.js'

export interface ProjectFileEntry {
  path: string
  name: string
  isDirectory: boolean
}

type ProjectStorage = 'memory' | 'native' | 'playground' | 'dev-target'

export interface OpenCodeWorkspaceOptions {
  readonly generatedFiles?: Readonly<Record<string, string>>
}

const PROJECT_LOG_PATH = 'logs/haku.log'

export class ProjectService {
  private readonly assetRegistry = createEngineAssetRegistry()
  private readonly componentRegistry = createEngineComponentRegistry()
  private root: string | null = null
  private manifest: ProjectManifest | null = null
  private prefabAssets = new Map<AssetId, PrefabDefinition>()
  private assetBaseUrl = ''
  private storage: ProjectStorage = 'memory'
  private modelBlobUrlCache = new Map<string, string>()
  private editorSettings: EditorProjectSettings = defaultEditorProjectSettings()
  private codeWorkspace: BrowserProjectWorkspace | null = null

  isFileSystemAccessSupported(): boolean {
    return isFileSystemAccessSupported()
  }

  usesNativeFileSystem(): boolean {
    return this.storage === 'native'
  }

  isVirtualFs(): boolean {
    return (
      this.storage === 'memory' || this.storage === 'playground' || this.storage === 'dev-target'
    )
  }

  private usesBrowserProjectStore(): boolean {
    return (
      this.storage === 'memory' || this.storage === 'playground' || this.storage === 'dev-target'
    )
  }

  canSyncAssetsToDisk(): boolean {
    return this.storage === 'playground' || this.storage === 'native'
  }

  /** Create a new project folder on disk and open it. */
  async createNewProject(): Promise<ProjectManifest> {
    if (!isFileSystemAccessSupported()) {
      throw new Error(
        'File System Access API is not supported in this browser. Use Chrome or Edge.',
      )
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
    this.codeWorkspace = null
    this.root = projectHandle.name
    this.assetBaseUrl = ''
    this.clearModelAssetCache()

    const manifestRaw = await nativeProjectStore.readText('haku.project.json')
    this.manifest = await this.normalizeManifest(validateProjectManifest(JSON.parse(manifestRaw)))

    await this.loadEditorSettings()
    sceneLog('project.open', {
      source: 'native-create',
      root: projectHandle.name,
      entryScene: this.resolveEntryScenePath(this.manifest),
    })
    const { world, document } = await this.loadScene(this.resolveEntryScenePath(this.manifest))
    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().setProjectRoot(projectHandle.name)
    useEditorStore
      .getState()
      .setScene(
        this.resolveEntryScenePath(this.manifest),
        document,
        world as World,
        this.getSceneEditorState(this.resolveEntryScenePath(this.manifest)).activeTab,
      )

    return this.manifest
  }

  /** Open project via File System Access API (read/write on disk). */
  async openFromDirectoryPicker(): Promise<ProjectManifest> {
    if (!isFileSystemAccessSupported()) {
      throw new Error(
        'File System Access API is not supported in this browser. Use Chrome or Edge.',
      )
    }

    const rootName = await nativeProjectStore.openDirectoryPicker()
    this.storage = 'native'
    this.codeWorkspace = null
    this.root = rootName
    this.assetBaseUrl = ''
    this.clearModelAssetCache()

    const manifestRaw = await nativeProjectStore.readText('haku.project.json')
    this.manifest = await this.normalizeManifest(validateProjectManifest(JSON.parse(manifestRaw)))

    await this.loadEditorSettings()
    sceneLog('project.open', {
      source: 'native',
      root: rootName,
      entryScene: this.resolveEntryScenePath(this.manifest),
    })
    const { world, document } = await this.loadScene(this.resolveEntryScenePath(this.manifest))
    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().setProjectRoot(rootName)
    useEditorStore
      .getState()
      .setScene(
        this.resolveEntryScenePath(this.manifest),
        document,
        world as World,
        this.getSceneEditorState(this.resolveEntryScenePath(this.manifest)).activeTab,
      )

    return this.manifest
  }

  /** Fallback: open project from folder picker (read-only snapshot in memory). */
  async openFromFileList(fileList: FileList): Promise<ProjectManifest> {
    const rootName = browserProjectStore.loadFromFileList(fileList)
    this.storage = 'memory'
    this.codeWorkspace = null
    this.root = rootName
    this.assetBaseUrl = ''
    this.clearModelAssetCache()

    const manifestRaw = await browserProjectStore.readText('haku.project.json')
    this.manifest = await this.normalizeManifest(validateProjectManifest(JSON.parse(manifestRaw)))

    await this.loadEditorSettings()
    sceneLog('project.open', {
      source: 'memory',
      root: rootName,
      entryScene: this.resolveEntryScenePath(this.manifest),
    })
    const { world, document } = await this.loadScene(this.resolveEntryScenePath(this.manifest))
    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().setProjectRoot(rootName)
    useEditorStore
      .getState()
      .setScene(
        this.resolveEntryScenePath(this.manifest),
        document,
        world as World,
        this.getSceneEditorState(this.resolveEntryScenePath(this.manifest)).activeTab,
      )

    return this.manifest
  }

  openFromManifest(
    rootPath: string,
    manifest: ProjectManifest,
    assetBaseUrl = '',
  ): ProjectManifest {
    this.root = rootPath
    this.manifest = manifest
    this.assetBaseUrl = assetBaseUrl
    this.storage = rootPath === 'playground' ? 'playground' : 'memory'
    this.codeWorkspace = null
    this.clearModelAssetCache()
    sceneLog('project.open', {
      source: rootPath === 'playground' ? 'playground' : 'manifest',
      root: rootPath,
      entryScene: this.resolveEntryScenePath(manifest),
    })
    return manifest
  }

  /**
   * Open a built-in playground demo scene (virtual FS + `/assets/manifest.json`).
   * Idempotent when the playground project is already active.
   */
  async openPlaygroundDemo(scenePath: string): Promise<{ world: IWorld; document: SceneDocument }> {
    const playgroundActive = this.storage === 'playground' && this.root === 'playground'

    if (!playgroundActive) {
      this.openFromManifest('playground', PLAYGROUND_PROJECT, '')
      await this.seedVirtualAssetsFromManifest('/assets/manifest.json')
      await this.loadEditorSettings()
    } else {
      await this.resyncVirtualAssetsFromManifest('/assets/manifest.json')
    }

    const { world, document } = await this.loadScene(scenePath)
    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().setProjectRoot('playground')
    useEditorStore
      .getState()
      .setScene(scenePath, document, world as World, this.getSceneEditorState(scenePath).activeTab)
    return { world, document }
  }

  /**
   * Open the dev-server target project (HAKU_TARGET_PATH on editor vite).
   * Used by `?hakuOpenTarget=1` dev flow — not for production.
   */
  async openFromDevPath(): Promise<ProjectManifest> {
    const infoRes = await fetch('/__haku/dev/info')
    if (!infoRes.ok) {
      throw new Error(
        'Dev target project unavailable — set HAKU_TARGET_PATH when starting editor-app dev',
      )
    }
    const info = (await infoRes.json()) as { rootName: string }

    const manifestRes = await fetch('/__haku/dev/project.json')
    if (!manifestRes.ok) {
      throw new Error('Failed to load target haku.project.json')
    }
    const manifest = await this.normalizeManifest(validateProjectManifest(await manifestRes.json()))

    this.root = info.rootName
    this.manifest = manifest
    this.assetBaseUrl = '/__haku/dev/assets'
    this.storage = 'dev-target'
    this.codeWorkspace = null
    this.clearModelAssetCache()

    await this.seedVirtualAssetsFromManifest('/__haku/dev/assets/manifest.json')
    await this.loadEditorSettings()

    sceneLog('project.open', {
      source: 'dev-target',
      root: info.rootName,
      entryScene: this.resolveEntryScenePath(manifest),
    })

    const { world, document } = await this.loadScene(this.resolveEntryScenePath(manifest))
    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().setProjectRoot(info.rootName)
    useEditorStore
      .getState()
      .setScene(
        this.resolveEntryScenePath(manifest),
        document,
        world as World,
        this.getSceneEditorState(this.resolveEntryScenePath(manifest)).activeTab,
      )

    return manifest
  }

  getRoot(): string | null {
    return this.root
  }

  getManifest(): ProjectManifest | null {
    return this.manifest
  }

  getCodeWorkspace(): BrowserProjectWorkspace | null {
    return this.codeWorkspace
  }

  async openCodeWorkspace(
    options: OpenCodeWorkspaceOptions = {},
  ): Promise<BrowserProjectWorkspace> {
    if (!this.root || !this.manifest) throw new Error('No project open')
    await this.persistGeneratedCodeFiles(options.generatedFiles ?? {})

    const fileSystem: BrowserProjectFileSystem =
      this.storage === 'native'
        ? {
            listFiles: () => nativeProjectStore.listWorkspaceFiles(),
            readFile: (path) => nativeProjectStore.readWorkspaceFile(path),
            writeFile: (path, text) => nativeProjectStore.writeWorkspaceFile(path, text),
          }
        : {
            listFiles: async () => browserProjectStore.listWorkspaceFiles(),
            readFile: (path) => browserProjectStore.readWorkspaceFile(path),
            writeFile: (path, text) => browserProjectStore.writeWorkspaceFile(path, text),
          }

    this.codeWorkspace = await BrowserProjectWorkspace.open({
      projectId: this.root,
      trustMode: this.codeWorkspaceTrustMode(),
      fileSystem,
    })
    return this.codeWorkspace
  }

  async forkBuiltInCodeWorkspaceToDisk(): Promise<BrowserProjectWorkspace> {
    const source = this.codeWorkspace
    if (!source || source.trustMode !== 'built-in') {
      throw new Error('Only an open built-in code workspace can be forked to disk.')
    }
    const destinationHandle = await nativeProjectStore.pickProjectDirectory()
    await nativeProjectStore.scaffoldProject(destinationHandle, new Map())
    const destination: BrowserProjectFileSystem = {
      listFiles: () => nativeProjectStore.listWorkspaceFiles(),
      readFile: (path) => nativeProjectStore.readWorkspaceFile(path),
      writeFile: (path, text) => nativeProjectStore.writeWorkspaceFile(path, text),
    }
    const forked = await source.forkToDisk(destinationHandle.name, destination)
    this.storage = 'native'
    this.root = destinationHandle.name
    this.codeWorkspace = forked
    return forked
  }

  getPrefabAssets(): ReadonlyMap<AssetId, PrefabDefinition> {
    return this.prefabAssets
  }

  async createGraphAsset(
    projectPath: string,
    name: string,
    id: GraphAsset['graph']['id'] = crypto.randomUUID(),
  ): Promise<GraphAsset> {
    if (!this.manifest) throw new Error('No project manifest loaded')
    const path = this.manifestAssetPath(projectPath)
    if (this.manifest.assets.some((entry) => entry.path === path)) {
      throw new Error(`An asset already exists at ${path}`)
    }
    const asset = GraphAssetSchema.parse({
      schemaVersion: 1,
      graph: {
        id,
        name,
        nodes: [],
        connections: [],
        publicInterface: { ports: [] },
        metadata: {},
      },
    })
    await this.writeProjectText(projectPath, `${JSON.stringify(asset, null, 2)}\n`)
    this.manifest = validateProjectManifest({
      ...this.manifest,
      assets: [
        ...this.manifest.assets,
        {
          id: assetId(id),
          type: GRAPH_ASSET_TYPE,
          path,
          dependencies: collectAssetReferences(asset),
          metadata: { name },
        },
      ],
    })
    validateProjectAssetComposition(this.manifest, this.assetRegistry)
    await this.persistManifest()
    return asset
  }

  async loadGraphAsset(projectPath: string): Promise<GraphAsset> {
    return GraphAssetSchema.parse(JSON.parse(await this.readProjectText(projectPath)))
  }

  async saveGraphAsset(projectPath: string, input: GraphAsset): Promise<GraphAsset> {
    if (!this.manifest) throw new Error('No project manifest loaded')
    const path = this.manifestAssetPath(projectPath)
    const index = this.manifest.assets.findIndex(
      (entry) => entry.path === path && entry.type === GRAPH_ASSET_TYPE,
    )
    if (index < 0) throw new Error(`Graph asset is not registered: ${path}`)
    const asset = GraphAssetSchema.parse(input)
    await this.writeProjectText(projectPath, `${JSON.stringify(asset, null, 2)}\n`)
    const assets = [...this.manifest.assets]
    assets[index] = {
      ...assets[index]!,
      dependencies: collectAssetReferences(asset),
      metadata: { ...assets[index]!.metadata, name: asset.graph.name },
    }
    this.manifest = validateProjectManifest({ ...this.manifest, assets })
    validateProjectAssetComposition(this.manifest, this.assetRegistry)
    await this.persistManifest()
    return asset
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
        document = validateSceneDocument(JSON.parse(raw))
      } else if (
        this.storage === 'memory' ||
        this.storage === 'playground' ||
        this.storage === 'dev-target'
      ) {
        const raw = await browserProjectStore.readText(relativePath)
        sceneLog('load.read', { path: relativePath, source: 'browser-store', bytes: raw.length })
        document = validateSceneDocument(JSON.parse(raw))
      } else {
        const url = `${this.assetBaseUrl}/${relativePath}`.replace(/\/+/g, '/')
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Failed to load scene: ${url}`)
        sceneLog('load.read', { path: relativePath, source: 'http', url, status: res.status })
        document = validateSceneDocument(await res.json())
      }

      await this.loadPrefabAssets()
      const world = loadSceneDocument(document, {
        expandPrefabs: false,
        componentRegistry: this.componentRegistry,
        prefabAssets: this.prefabAssets,
      })
      sceneLog('load.success', {
        path: relativePath,
        name: document.metadata?.name,
        entityCount: world.getAllEntities().length,
        prefabCount: this.prefabAssets.size,
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

  async saveScene(
    relativePath: string,
    world: IWorld,
    document: SceneDocument,
  ): Promise<SceneDocument> {
    const saved = saveSceneDocument(
      world,
      document.metadata,
      document.prototypes,
      document.renderSettings,
      document.physicsSettings,
      this.componentRegistry,
    )
    const json = JSON.stringify(saved, null, 2) + '\n'

    sceneLog('save.start', { path: relativePath, storage: this.storage })

    if (this.storage === 'native') {
      await nativeProjectStore.writeText(relativePath, json)
    } else if (
      this.storage === 'memory' ||
      this.storage === 'playground' ||
      this.storage === 'dev-target'
    ) {
      browserProjectStore.writeText(relativePath, json)
      if (this.storage === 'playground') {
        await this.writePlaygroundFileToDisk(relativePath, json)
      } else if (this.storage === 'dev-target') {
        await this.writeDevTargetFileToDisk(relativePath, json)
      }
    }

    await this.updateSceneManifestDependencies(relativePath, saved)

    sceneLog('save.success', { path: relativePath, storage: this.storage, bytes: json.length })

    const { useEditorStore } = await import('../store/editor-store.js')
    useEditorStore.getState().markSceneSaved(saved)

    return saved
  }

  updateSceneDocument(document: SceneDocument): void {
    import('../store/editor-store.js').then(({ useEditorStore }) => {
      const world = useEditorStore.getState().world
      if (world) {
        useEditorStore
          .getState()
          .setScene(useEditorStore.getState().scenePath ?? '', document, world)
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

  async listAllAssetFiles(): Promise<ProjectFileEntry[]> {
    if (!this.manifest) return []

    const assetsRoot = this.getAssetsRoot()
    if (this.storage === 'native') {
      return nativeProjectStore.listAllFilesUnder(assetsRoot)
    }

    return browserProjectStore.listAllFilesUnder(assetsRoot)
  }

  async seedVirtualAssets(entries: Array<{ path: string; url: string }>): Promise<void> {
    this.storage = 'playground'
    for (const entry of entries) {
      await browserProjectStore.registerFromUrl(entry.path, entry.url)
    }
  }

  async seedVirtualAssetsFromManifest(manifestUrl: string, assetsDir?: string): Promise<void> {
    const root = assetsDir ?? this.getAssetsRoot()
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

  async resyncVirtualAssetsFromManifest(
    manifestUrl = '/assets/manifest.json',
    assetsDir?: string,
  ): Promise<void> {
    if (this.storage !== 'playground' && this.storage !== 'dev-target') return
    const root = assetsDir ?? this.getAssetsRoot()
    browserProjectStore.removeUnderPrefix(root)
    const url = this.storage === 'dev-target' ? '/__haku/dev/assets/manifest.json' : manifestUrl
    await this.seedVirtualAssetsFromManifest(url, root)
  }

  async importAsset(relativePath: string, file: File): Promise<void> {
    if (this.storage === 'native') {
      await nativeProjectStore.writeFile(relativePath, file)
    } else {
      browserProjectStore.registerFile(relativePath, { file, isBinary: isBinaryFile(file.name) })
      if (this.storage === 'playground') {
        await this.writePlaygroundFileToDisk(relativePath, file)
      }
    }

    await this.registerImportedAsset(relativePath)
  }

  supportsShellActions(): boolean {
    return this.storage === 'native' || this.storage === 'playground'
  }

  canUseShellActions(): boolean {
    return this.storage === 'playground'
  }

  async revealInFileManager(relativePath: string): Promise<void> {
    if (!this.supportsShellActions()) {
      throw new Error('Show in Finder is not available for in-memory projects')
    }

    if (this.storage === 'playground') {
      const res = await fetch('/__haku/shell/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relativePath }),
      })
      if (!res.ok) {
        throw new Error((await res.text()) || 'Failed to reveal in file manager')
      }
      return
    }

    throw new Error('Show in Finder is not available for browser-native projects')
  }

  async openInTerminal(relativeDir: string): Promise<void> {
    if (!this.supportsShellActions()) {
      throw new Error('Open in Terminal is not available for in-memory projects')
    }

    if (this.storage === 'playground') {
      const res = await fetch('/__haku/shell/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relativeDir }),
      })
      if (!res.ok) {
        throw new Error((await res.text()) || 'Failed to open terminal')
      }
      return
    }

    throw new Error('Open in Terminal is not available for browser-native projects')
  }

  async duplicateAsset(sourcePath: string): Promise<string> {
    if (!this.manifest) throw new Error('No project open')

    const assetsRoot = this.getAssetsRoot()
    const normalized = sourcePath.replace(/^\/+/, '')
    if (normalized !== assetsRoot && !normalized.startsWith(`${assetsRoot}/`)) {
      throw new Error(`Asset must be under ${assetsRoot}/`)
    }

    const parentDir = normalized.includes('/')
      ? normalized.slice(0, normalized.lastIndexOf('/'))
      : assetsRoot
    const fileName = normalized.slice(normalized.lastIndexOf('/') + 1)
    const siblings = await this.listDirectory(parentDir)
    const existingNames = new Set(siblings.map((entry) => entry.name))
    const duplicateName = suggestDuplicateAssetName(fileName, existingNames)
    const destPath = `${parentDir}/${duplicateName}`

    if (this.storage === 'native') {
      await nativeProjectStore.copyFile(normalized, destPath)
    } else {
      browserProjectStore.copyFile(normalized, destPath)
      if (this.storage === 'playground') {
        const blob = await browserProjectStore.getBlob(normalized)
        await this.writePlaygroundFileToDisk(destPath, blob)
      }
    }

    await this.registerDuplicatedAsset(normalized, destPath)
    return destPath
  }

  async renameAsset(sourcePath: string, newName: string): Promise<string> {
    if (!this.manifest) throw new Error('No project open')

    const assetsRoot = this.getAssetsRoot()
    const normalized = sourcePath.replace(/^\/+/, '')
    if (normalized !== assetsRoot && !normalized.startsWith(`${assetsRoot}/`)) {
      throw new Error(`Asset must be under ${assetsRoot}/`)
    }

    const trimmedName = newName.trim()
    if (!trimmedName) throw new Error('Name is required')
    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      throw new Error('Name cannot contain slashes')
    }

    const parentDir = normalized.includes('/')
      ? normalized.slice(0, normalized.lastIndexOf('/'))
      : assetsRoot
    const destPath = `${parentDir}/${trimmedName}`
    if (destPath === normalized) return destPath

    const siblings = await this.listDirectory(parentDir)
    if (siblings.some((entry) => entry.name === trimmedName && entry.path !== normalized)) {
      throw new Error(`An item named “${trimmedName}” already exists in this folder`)
    }

    const sourceEntry = siblings.find((entry) => entry.path === normalized)
    if (this.storage === 'native' && sourceEntry?.isDirectory) {
      throw new Error('Renaming folders is not supported for native disk projects yet')
    }

    if (this.storage === 'native') {
      await nativeProjectStore.renamePath(normalized, destPath)
    } else {
      browserProjectStore.renamePath(normalized, destPath)
      if (this.storage === 'playground') {
        try {
          const blob = await browserProjectStore.getBlob(destPath)
          await this.writePlaygroundFileToDisk(destPath, blob)
        } catch {
          // Best-effort disk sync for renamed virtual assets.
        }
      }
    }

    await this.registerRenamedAsset(normalized, destPath)
    return destPath
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
    return this.manifest ? this.resolveEntryScenePath(this.manifest) : null
  }

  getAssetsRoot(): string {
    return this.manifest?.assetsDir ?? DEFAULT_ASSETS_DIR
  }

  getAssetRefByPath(relativePath: string, expectedType: AssetTypeId): AssetRef {
    if (!this.manifest) throw new Error('No project manifest is open')
    const normalized = relativePath.replace(/^\/+/, '')
    const manifestPath = relativeToAssetsDir(normalized, this.manifest.assetsDir) ?? normalized
    const entry = this.manifest.assets.find((asset) => asset.path === manifestPath)
    if (!entry) {
      throw new Error(`Asset path is not registered in the project manifest: ${normalized}`)
    }
    new ProjectAssetIndex(this.manifest).require(
      { $ref: entry.id, type: expectedType },
      expectedType,
    )
    return { $ref: entry.id, type: expectedType }
  }

  getAssetPath(reference: AssetRef): string {
    if (!this.manifest) throw new Error('No project manifest is open')
    return new ProjectAssetIndex(this.manifest).path(reference)
  }

  clearModelAssetCache(): void {
    modelLog('cache.clear', { entries: this.modelBlobUrlCache.size })
    for (const url of this.modelBlobUrlCache.values()) {
      URL.revokeObjectURL(url)
    }
    this.modelBlobUrlCache.clear()
    clearModelCache()
  }

  async prepareModelLoad(assetId: AssetId): Promise<void> {
    const relativePath = this.resolveModelPath(assetId)
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

  resolveModelAsset(assetId: AssetId): { path: string; url: string } {
    const relativePath = this.resolveModelPath(assetId)
    const assetsRoot = this.getAssetsRoot()
    const fullPath = `${assetsRoot}/${relativePath.replace(/^\/+/, '')}`

    if (this.assetBaseUrl) {
      const url = `${this.assetBaseUrl}/${relativePath}`.replace(/\/+/g, '/')
      modelLog('resolve.asset', {
        relativePath,
        fullPath,
        storage: this.storage,
        source: 'asset-base-url',
        url,
      })
      return { path: relativePath, url }
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
      return { path: relativePath, url: cached }
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
        return { path: relativePath, url: blobUrl }
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
    return { path: relativePath, url: fallback }
  }

  resolveModelResourceUrl(modelAssetId: AssetId, resourceFileName: string): string {
    const modelRelativePath = this.resolveModelPath(modelAssetId)
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

  private resolveModelPath(assetId: AssetId): string {
    if (!this.manifest) throw new Error('No project manifest is open')
    return new ProjectAssetIndex(this.manifest).path(
      { $ref: assetId, type: MODEL_ASSET_TYPE },
      MODEL_ASSET_TYPE,
    )
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

  private async writePlaygroundFileToDisk(
    relativePath: string,
    body: string | Blob,
  ): Promise<void> {
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

  private async writePlaygroundProjectFileToDisk(
    relativePath: string,
    body: string,
  ): Promise<void> {
    const res = await fetch('/__haku/project/file', {
      method: 'PUT',
      headers: { 'X-Haku-File-Path': relativePath },
      body,
    })

    if (!res.ok) {
      const message = await res.text()
      throw new Error(message || `Failed to write project file: ${relativePath}`)
    }
  }

  private async writeDevTargetFileToDisk(relativePath: string, body: string): Promise<void> {
    const res = await fetch('/__haku/dev/file', {
      method: 'PUT',
      headers: { 'X-Haku-File-Path': relativePath },
      body,
    })

    if (!res.ok) {
      const message = await res.text()
      throw new Error(message || `Failed to write target file: ${relativePath}`)
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
      modelLog('blob.created', {
        fullPath,
        storage: this.storage,
        source: 'browser-store',
        url: modelLogUrl(url),
      })
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
      return JSON.parse(text) as {
        buffers?: Array<{ uri?: string }>
        images?: Array<{ uri?: string }>
      }
    }

    if (this.usesBrowserProjectStore()) {
      const text = await browserProjectStore.readText(fullPath)
      return JSON.parse(text) as {
        buffers?: Array<{ uri?: string }>
        images?: Array<{ uri?: string }>
      }
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

  getSceneEditorState(scenePath: string): SceneEditorState {
    return this.editorSettings.scenes[scenePath] ?? defaultSceneEditorState()
  }

  updateSceneEditorState(scenePath: string, patch: Partial<SceneEditorState>): void {
    const current = this.getSceneEditorState(scenePath)
    this.editorSettings = {
      ...this.editorSettings,
      scenes: {
        ...this.editorSettings.scenes,
        [scenePath]: SceneEditorStateSchema.parse({ ...current, ...patch }),
      },
    }
  }

  async loadEditorSettings(): Promise<void> {
    try {
      let raw: string
      if (this.storage === 'native') {
        raw = await nativeProjectStore.readText(EDITOR_PROJECT_SETTINGS_PATH)
      } else if (this.usesBrowserProjectStore()) {
        if (!browserProjectStore.has(EDITOR_PROJECT_SETTINGS_PATH)) {
          this.editorSettings = defaultEditorProjectSettings()
          return
        }
        raw = await browserProjectStore.readText(EDITOR_PROJECT_SETTINGS_PATH)
      } else {
        this.editorSettings = defaultEditorProjectSettings()
        return
      }
      this.editorSettings = EditorProjectSettingsSchema.parse(JSON.parse(raw))
    } catch {
      this.editorSettings = defaultEditorProjectSettings()
    }
  }

  async saveEditorSettings(): Promise<void> {
    const json = JSON.stringify(this.editorSettings, null, 2) + '\n'

    if (this.storage === 'native') {
      await nativeProjectStore.writeText(EDITOR_PROJECT_SETTINGS_PATH, json)
      return
    }

    if (this.usesBrowserProjectStore()) {
      browserProjectStore.writeText(EDITOR_PROJECT_SETTINGS_PATH, json)
      if (this.storage === 'playground') {
        await this.writePlaygroundProjectFileToDisk(EDITOR_PROJECT_SETTINGS_PATH, json)
      } else if (this.storage === 'dev-target') {
        await this.writeDevTargetFileToDisk(EDITOR_PROJECT_SETTINGS_PATH, json)
      }
    }
  }

  async persistSceneWorkspace(
    scenePath: string,
    editorCamera: SceneEditorState['editorCamera'],
    activeTab: SceneEditorState['activeTab'],
  ): Promise<void> {
    this.updateSceneEditorState(scenePath, { editorCamera, activeTab })
    await this.saveEditorSettings()
  }

  persistSceneWorkspaceInBackground(
    scenePath: string,
    editorCamera: SceneEditorState['editorCamera'],
    activeTab: SceneEditorState['activeTab'],
  ): void {
    void this.persistSceneWorkspace(scenePath, editorCamera, activeTab).catch((error) => {
      sceneLogError('workspace.save.failed', { scenePath, storage: this.storage }, error)
    })
  }

  private async normalizeManifest(manifest: ProjectManifest): Promise<ProjectManifest> {
    validateProjectAssetComposition(manifest, this.assetRegistry)
    return manifest
  }

  async createPrefabAsset(
    definition: PrefabDefinition,
    displayName: string,
  ): Promise<AssetRef> {
    if (!this.manifest) throw new Error('No project manifest loaded')
    const parsed = PrefabDefinitionSchema.parse(definition)
    const id = assetId(crypto.randomUUID())
    const safeName = displayName.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'prefab'
    const manifestPath = `prefabs/${safeName}-${id}.prefab.json`
    const projectPath = `${this.manifest.assetsDir}/${manifestPath}`
    await this.writeProjectText(projectPath, JSON.stringify(parsed, null, 2) + '\n')
    this.manifest = validateProjectManifest({
      ...this.manifest,
      assets: [
        ...this.manifest.assets,
        {
          id,
          type: PREFAB_ASSET_TYPE,
          path: manifestPath,
          dependencies: collectAssetReferences(parsed),
          metadata: { name: displayName },
        },
      ],
    })
    validateProjectAssetComposition(this.manifest, this.assetRegistry)
    await this.persistManifest()
    this.prefabAssets.set(id, parsed)
    return assetRef(id, PREFAB_ASSET_TYPE)
  }

  listPrefabAssetRefs(): AssetRef[] {
    if (!this.manifest) return []
    return this.manifest.assets
      .filter((entry) => entry.type === PREFAB_ASSET_TYPE)
      .map((entry) => assetRef(entry.id, PREFAB_ASSET_TYPE))
  }

  private async loadPrefabAssets(): Promise<void> {
    this.prefabAssets = new Map()
    if (!this.manifest) return
    for (const entry of this.manifest.assets) {
      if (entry.type !== PREFAB_ASSET_TYPE) continue
      const projectPath = `${this.manifest.assetsDir}/${entry.path}`.replace(/\/+/g, '/')
      const raw = await this.readProjectText(projectPath)
      this.prefabAssets.set(entry.id, PrefabDefinitionSchema.parse(JSON.parse(raw)))
    }
  }

  private async readProjectText(path: string): Promise<string> {
    if (this.storage === 'native') return nativeProjectStore.readText(path)
    if (this.usesBrowserProjectStore()) return browserProjectStore.readText(path)
    const url = `${this.assetBaseUrl}/${path}`.replace(/\/+/g, '/')
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to load asset: ${url}`)
    return response.text()
  }

  private async persistGeneratedCodeFiles(files: Readonly<Record<string, string>>): Promise<void> {
    for (const [path, text] of Object.entries(files).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (path !== 'tsconfig.json' && !path.startsWith('.haku/generated/')) {
        throw new Error(`Generated code tooling cannot write outside .haku/generated: ${path}`)
      }
      if (this.storage === 'native') {
        await nativeProjectStore.writeText(path, text)
        continue
      }
      browserProjectStore.writeText(path, text)
      if (this.storage === 'dev-target') {
        await this.writeDevTargetFileToDisk(path, text)
      }
    }
  }

  private codeWorkspaceTrustMode(): BrowserProjectTrustMode {
    if (this.storage === 'playground') return 'built-in'
    if (this.storage === 'native' || this.storage === 'dev-target') return 'local-trusted'
    return 'imported-untrusted'
  }

  private async writeProjectText(path: string, body: string): Promise<void> {
    if (this.storage === 'native') {
      await nativeProjectStore.writeText(path, body)
      return
    }
    if (!this.usesBrowserProjectStore()) throw new Error('Project storage is read-only')
    browserProjectStore.writeText(path, body)
    if (this.storage === 'playground') await this.writePlaygroundFileToDisk(path, body)
    if (this.storage === 'dev-target') await this.writeDevTargetFileToDisk(path, body)
  }

  private async updateSceneManifestDependencies(
    projectPath: string,
    document: SceneDocument,
  ): Promise<void> {
    if (!this.manifest) return
    const manifestPath = this.manifestAssetPath(projectPath)
    const index = this.manifest.assets.findIndex(
      (entry) => entry.path === manifestPath && entry.type === SCENE_ASSET_TYPE,
    )
    if (index < 0) return
    const assets = [...this.manifest.assets]
    assets[index] = {
      ...assets[index]!,
      dependencies: collectAssetReferences(document),
    }
    this.manifest = validateProjectManifest({ ...this.manifest, assets })
    validateProjectAssetComposition(this.manifest, this.assetRegistry)
    await this.persistManifest()
  }

  private resolveEntryScenePath(manifest: ProjectManifest): string {
    const relativePath = new ProjectAssetIndex(manifest).path(manifest.entryScene, SCENE_ASSET_TYPE)
    return `${manifest.assetsDir}/${relativePath}`.replace(/\/+/g, '/')
  }

  private manifestAssetPath(projectPath: string): string {
    if (!this.manifest) throw new Error('No project manifest is open')
    const relativePath = relativeToAssetsDir(projectPath, this.manifest.assetsDir)
    if (!relativePath) {
      throw new Error(`Asset must be under ${this.manifest.assetsDir}/`)
    }
    return relativePath
  }

  private async registerImportedAsset(projectPath: string): Promise<void> {
    if (!this.manifest) throw new Error('No project manifest is open')
    const path = this.manifestAssetPath(projectPath)
    if (this.manifest.assets.some((entry) => entry.path === path)) return

    this.manifest = validateProjectManifest({
      ...this.manifest,
      assets: [
        ...this.manifest.assets,
        {
          id: assetId(crypto.randomUUID()),
          type: assetTypeForPath(path),
          path,
          dependencies: [],
          metadata: {},
        },
      ],
    })
    await this.persistManifest()
  }

  private async registerDuplicatedAsset(
    sourceProjectPath: string,
    destProjectPath: string,
  ): Promise<void> {
    if (!this.manifest) throw new Error('No project manifest is open')
    const sourcePath = this.manifestAssetPath(sourceProjectPath)
    const destPath = this.manifestAssetPath(destProjectPath)
    const source = this.manifest.assets.find((entry) => entry.path === sourcePath)
    if (!source)
      throw new Error(`Asset path is not registered in the project manifest: ${sourcePath}`)

    this.manifest = validateProjectManifest({
      ...this.manifest,
      assets: [
        ...this.manifest.assets,
        {
          ...source,
          id: assetId(crypto.randomUUID()),
          path: destPath,
        },
      ],
    })
    await this.persistManifest()
  }

  private async registerRenamedAsset(
    sourceProjectPath: string,
    destProjectPath: string,
  ): Promise<void> {
    if (!this.manifest) throw new Error('No project manifest is open')
    const sourcePath = this.manifestAssetPath(sourceProjectPath)
    const destPath = this.manifestAssetPath(destProjectPath)
    const sourcePrefix = `${sourcePath}/`

    this.manifest = validateProjectManifest({
      ...this.manifest,
      assets: this.manifest.assets.map((entry) => {
        if (entry.path === sourcePath) return { ...entry, path: destPath }
        if (entry.path.startsWith(sourcePrefix)) {
          return { ...entry, path: `${destPath}/${entry.path.slice(sourcePrefix.length)}` }
        }
        return entry
      }),
    })
    await this.persistManifest()
  }

  private async persistManifest(): Promise<void> {
    if (!this.manifest) throw new Error('No project manifest is open')
    const json = JSON.stringify(this.manifest, null, 2) + '\n'
    if (this.storage === 'native') {
      await nativeProjectStore.writeText('haku.project.json', json)
      return
    }

    browserProjectStore.writeText('haku.project.json', json)
    if (this.storage === 'playground') {
      await this.writePlaygroundProjectFileToDisk('haku.project.json', json)
    } else if (this.storage === 'dev-target') {
      await this.writeDevTargetFileToDisk('haku.project.json', json)
    }
  }
}

function assetTypeForPath(path: string): AssetTypeId {
  const lower = path.toLowerCase()
  if (lower.endsWith('.graph.json')) return GRAPH_ASSET_TYPE
  if (lower.endsWith('.scene.json')) return SCENE_ASSET_TYPE
  if (lower.endsWith('.gltf') || lower.endsWith('.glb')) return MODEL_ASSET_TYPE
  if (/\.(png|jpe?g|webp|gif|ktx2)$/.test(lower)) return TEXTURE_ASSET_TYPE
  if (/\.(bin|wasm)$/.test(lower)) return BINARY_ASSET_TYPE
  return DATA_ASSET_TYPE
}

function isBinaryFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return (
    ext === 'glb' ||
    ext === 'bin' ||
    ext === 'png' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'webp'
  )
}

function suggestDuplicateAssetName(originalName: string, existingNames: Set<string>): string {
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

export const projectService = new ProjectService()

export function extractPrefabSubtree(
  world: IWorld,
  rootId: EntityId,
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
    activeSelf: world.getActiveSelf(id),
    parent: (() => {
      const p = world.getParent(id)
      if (!p) return null
      return idSet.has(p.value) ? p.value : null
    })(),
    components: world.getComponentTypes(id).flatMap((typeId) => {
      const type = getEngineComponent(typeId)
      if (!type || typeId === PrefabInstanceComponent.id) return []
      const data = world.getComponent(id, type)
      return data !== undefined ? [{ type: typeId, data: data as Record<string, unknown> }] : []
    }),
  }))

  return { entities }
}

export function assignPrototype(
  document: SceneDocument,
  prototypeId: string,
  sourceAsset: AssetRef,
): SceneDocument {
  return {
    ...document,
    prototypes: {
      ...document.prototypes,
      [prototypeId]: { id: prototypeId, mode: 'mesh', sourceAsset },
    },
  }
}

export function assignMeshPrototype(
  world: IWorld,
  targetId: EntityId,
  meshRenderer: import('@haku/engine').MeshRenderer,
): void {
  world.addComponent(targetId, MeshRendererComponent, meshRenderer)
}
