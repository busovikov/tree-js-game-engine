import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface SceneComponent {
  type?: string
  data?: {
    geometryType?: string
    modelAsset?: { $ref: string }
    position?: [number, number, number]
    rotation?: [number, number, number, number]
    followCamera?: boolean
  }
}

interface SceneDocument {
  metadata?: { activeCameraId?: string }
  entities?: Array<{
    id?: string
    name?: string
    components?: SceneComponent[]
  }>
}

interface ProjectManifest {
  assetsDir: string
  entryScene: { $ref: string; type: string }
  assets: Array<{
    id: string
    type: string
    path: string
    dependencies?: Array<{ $ref: string; type?: string }>
  }>
}

function resolveManifestAsset(projectRoot: string, manifest: ProjectManifest, id: string): string {
  const entry = manifest.assets.find((asset) => asset.id === id)
  if (!entry) return resolve(projectRoot, '__missing_asset__')
  return resolve(projectRoot, manifest.assetsDir, entry.path)
}

function listFiles(root: string, prefix = ''): string[] {
  return readdirSync(resolve(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return listFiles(root, path)
    if (entry.name === '.DS_Store' || entry.name === '.gitkeep') return []
    return [path]
  })
}

function collectAssetRefs(value: unknown, refs: Array<{ $ref: string; type?: string }>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetRefs(item, refs)
    return
  }
  if (!value || typeof value !== 'object') return
  const object = value as Record<string, unknown>
  if (typeof object.$ref === 'string') {
    refs.push({
      $ref: object.$ref,
      type: typeof object.type === 'string' ? object.type : undefined,
    })
  }
  for (const item of Object.values(object)) collectAssetRefs(item, refs)
}

describe('playground entry scene', () => {
  it('registers every asset file and resolves every typed dependency and scene reference', () => {
    const playgroundRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const project = JSON.parse(
      readFileSync(resolve(playgroundRoot, 'haku.project.json'), 'utf8'),
    ) as ProjectManifest
    const assetsRoot = resolve(playgroundRoot, project.assetsDir)
    const entriesById = new Map(project.assets.map((entry) => [entry.id, entry]))

    expect(project.assets.map((entry) => entry.path).sort()).toEqual(listFiles(assetsRoot).sort())
    expect(entriesById.size).toBe(project.assets.length)

    const references = [
      project.entryScene,
      ...project.assets.flatMap((entry) => entry.dependencies ?? []),
    ]
    for (const entry of project.assets.filter((asset) => asset.path.endsWith('.scene.json'))) {
      collectAssetRefs(
        JSON.parse(readFileSync(resolve(assetsRoot, entry.path), 'utf8')),
        references,
      )
    }

    for (const reference of references) {
      const target = entriesById.get(reference.$ref)
      expect(target, `missing manifest asset ${reference.$ref}`).toBeDefined()
      if (reference.type) expect(target?.type).toBe(reference.type)
    }
  })

  it('does not reference missing model assets', () => {
    const playgroundRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const project = JSON.parse(
      readFileSync(resolve(playgroundRoot, 'haku.project.json'), 'utf8'),
    ) as ProjectManifest
    const scenePath = resolveManifestAsset(playgroundRoot, project, project.entryScene.$ref)
    const scene = JSON.parse(readFileSync(scenePath, 'utf8')) as SceneDocument

    const missingAssets =
      scene.entities?.flatMap((entity) =>
        (entity.components ?? [])
          .filter(
            (component) =>
              component.type === '40000000-0000-4000-8000-000000000004' &&
              component.data?.geometryType === 'ModelGeometry' &&
              component.data.modelAsset,
          )
          .filter(
            (component) =>
              !existsSync(
                resolve(
                  playgroundRoot,
                  project.assetsDir,
                  project.assets.find((asset) => asset.id === component.data?.modelAsset?.$ref)
                    ?.path ?? '__missing_asset__',
                ),
              ),
          )
          .map((component) => `${entity.name ?? 'Unnamed entity'}: ${component.data?.modelAsset}`),
      ) ?? []

    expect(missingAssets).toEqual([])
  })

  it('aims the active camera at the playable area', () => {
    const playgroundRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const project = JSON.parse(
      readFileSync(resolve(playgroundRoot, 'haku.project.json'), 'utf8'),
    ) as ProjectManifest
    const scene = JSON.parse(
      readFileSync(resolveManifestAsset(playgroundRoot, project, project.entryScene.$ref), 'utf8'),
    ) as SceneDocument
    const camera = scene.entities?.find((entity) => entity.id === scene.metadata?.activeCameraId)
    const transform = camera?.components?.find(
      (component) => component.type === '40000000-0000-4000-8000-000000000001',
    )?.data
    const [px, py, pz] = transform?.position ?? [0, 0, 0]
    const [qx, qy, qz, qw] = transform?.rotation ?? [0, 0, 0, 1]

    const forward = [
      -2 * (qx * qz + qw * qy),
      -2 * (qy * qz - qw * qx),
      -(1 - 2 * (qx * qx + qy * qy)),
    ]
    const toPlayArea = [0 - px, 3 - py, 5 - pz]
    const length = Math.hypot(...toPlayArea)
    const alignment =
      (forward[0]! * toPlayArea[0]! + forward[1]! * toPlayArea[1]! + forward[2]! * toPlayArea[2]!) /
      length

    expect(alignment).toBeGreaterThan(0.995)
    const controllerTypeIds = new Set([
      '40000000-0000-4000-8000-000000000015',
      '40000000-0000-4000-8000-000000000016',
      '40000000-0000-4000-8000-000000000017',
      '40000000-0000-4000-8000-000000000018',
      '40000000-0000-4000-8000-000000000019',
      '40000000-0000-4000-8000-000000000020',
      '40000000-0000-4000-8000-000000000021',
    ])
    const controllers =
      scene.entities?.flatMap((entity) =>
        (entity.components ?? []).filter(
          (component) => component.type !== undefined && controllerTypeIds.has(component.type),
        ),
      ) ?? []
    expect(controllers.length).toBeGreaterThan(0)
    expect(controllers.every((component) => component.data?.followCamera === false)).toBe(true)
  })
})
