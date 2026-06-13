import { HakuProjectSchema, type HakuProject, type PrefabDefinition, type SceneDocument } from '@haku/schema'
import { loadSceneDocument, saveSceneDocument } from '@haku/serializer'
import type { EntityId, IWorld } from '@haku/core'
import { MeshRendererComponent, World, getCoreComponent } from '@haku/core'
import { browserProjectStore } from './browser-project-store.js'

export interface ProjectFileEntry {
  path: string
  name: string
  isDirectory: boolean
}

export class ProjectService {
  private root: string | null = null
  private manifest: HakuProject | null = null
  private assetBaseUrl = ''
  private useVirtualFs = false

  /** Open project from folder picker (webkitdirectory). */
  async openFromFileList(fileList: FileList): Promise<HakuProject> {
    const rootName = browserProjectStore.loadFromFileList(fileList)
    this.useVirtualFs = true
    this.root = rootName
    this.assetBaseUrl = ''

    const manifestRaw = await browserProjectStore.readText('haku.project.json')
    this.manifest = HakuProjectSchema.parse(JSON.parse(manifestRaw))

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
    this.useVirtualFs = false
    return manifest
  }

  getRoot(): string | null {
    return this.root
  }

  getManifest(): HakuProject | null {
    return this.manifest
  }

  async loadScene(relativePath: string): Promise<{ world: IWorld; document: SceneDocument }> {
    let document: SceneDocument

    if (this.useVirtualFs) {
      const raw = await browserProjectStore.readText(relativePath)
      document = JSON.parse(raw) as SceneDocument
    } else {
      const url = `${this.assetBaseUrl}/${relativePath}`.replace(/\/+/g, '/')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to load scene: ${url}`)
      document = (await res.json()) as SceneDocument
    }

    const world = loadSceneDocument(document, { expandPrefabs: false })
    return { world, document }
  }

  async saveScene(relativePath: string, world: IWorld, document: SceneDocument): Promise<SceneDocument> {
    const saved = saveSceneDocument(world, document.metadata, document.prototypes, document.prefabs)
    const json = JSON.stringify(saved, null, 2) + '\n'

    if (this.useVirtualFs) {
      browserProjectStore.writeText(relativePath, json)
    }

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
    return null // use store instead
  }

  async listDirectory(relativeDir: string): Promise<ProjectFileEntry[]> {
    if (!this.manifest) return []

    const assetsRoot = this.manifest.assetsDir
    const dir = relativeDir || assetsRoot

    if (dir !== assetsRoot && !dir.startsWith(`${assetsRoot}/`)) {
      return []
    }

    return browserProjectStore.listDirectory(dir)
  }

  /** Seed virtual files from URLs (demo / dev mode). */
  async seedVirtualAssets(entries: Array<{ path: string; url: string }>): Promise<void> {
    this.useVirtualFs = true
    for (const entry of entries) {
      await browserProjectStore.registerFromUrl(entry.path, entry.url)
    }
  }

  /** Load all playground/project assets listed in assets/manifest.json. */
  async seedVirtualAssetsFromManifest(manifestUrl: string, assetsDir = 'assets'): Promise<void> {
    this.useVirtualFs = true
    const res = await fetch(manifestUrl)
    if (!res.ok) throw new Error(`Failed to load asset manifest: ${manifestUrl}`)

    const manifest = (await res.json()) as { files?: string[] }
    const files = manifest.files ?? []
    const baseUrl = manifestUrl.slice(0, manifestUrl.lastIndexOf('/'))

    for (const relativePath of files) {
      const path = `${assetsDir}/${relativePath.replace(/^\/+/, '')}`
      const url = `${baseUrl}/${relativePath.replace(/^\/+/, '')}`
      await browserProjectStore.registerFromUrl(path, url)
    }
  }

  importVirtualAsset(relativePath: string, file: File): void {
    browserProjectStore.registerFile(relativePath, { file, isBinary: isBinaryFile(file.name) })
  }

  isVirtualFs(): boolean {
    return this.useVirtualFs
  }

  getEntryScene(): string | null {
    return this.manifest?.entryScene ?? null
  }

  getAssetsRoot(): string {
    return this.manifest?.assetsDir ?? 'assets'
  }
}

function isBinaryFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'glb' || ext === 'gltf' || ext === 'bin' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp'
}

export const projectService = new ProjectService()

/** Collect entity subtree as prefab definition (relative entity ids). */
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
