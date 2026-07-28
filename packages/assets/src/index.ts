import { z } from 'zod'
import {
  AssetIdSchema,
  AssetRefSchema,
  AssetTypeIdSchema,
  CustomComponentTypeAssetSchema,
  assetId,
  assetRef,
  assetTypeId,
  type AssetId,
  type AssetRef,
  type AssetTypeId,
  type ParsedCustomComponentTypeAsset,
} from '@haku/schema'

export {
  AssetIdSchema,
  AssetRefSchema,
  AssetTypeIdSchema,
  assetId,
  assetRef,
  assetTypeId,
  type AssetId,
  type AssetRef,
  type AssetTypeId,
}

export const SCENE_ASSET_TYPE = assetTypeId('20000000-0000-4000-8000-000000000001')
export const PREFAB_ASSET_TYPE = assetTypeId('20000000-0000-4000-8000-000000000002')
export const MODEL_ASSET_TYPE = assetTypeId('20000000-0000-4000-8000-000000000003')
export const TEXTURE_ASSET_TYPE = assetTypeId('20000000-0000-4000-8000-000000000004')
export const BINARY_ASSET_TYPE = assetTypeId('20000000-0000-4000-8000-000000000005')
export const DATA_ASSET_TYPE = assetTypeId('20000000-0000-4000-8000-000000000006')
export const CUSTOM_COMPONENT_TYPE_ASSET_TYPE = assetTypeId(
  '20000000-0000-4000-8000-000000000007',
)

export type AssetDiagnosticCode =
  | 'manifest.invalid'
  | 'asset.duplicate-id'
  | 'asset.unknown-id'
  | 'asset.type-mismatch'
  | 'asset.dependency-cycle'
  | 'asset-type.duplicate-id'
  | 'asset-type.unknown-id'

export interface AssetDiagnostic {
  readonly code: AssetDiagnosticCode
  readonly severity: 'error'
  readonly message: string
  readonly path?: string
  readonly assetId?: AssetId
  readonly expectedType?: AssetTypeId
  readonly actualType?: AssetTypeId
}

export class AssetDiagnosticError extends Error {
  readonly diagnostics: readonly AssetDiagnostic[]

  constructor(diagnostics: readonly AssetDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'))
    this.name = 'AssetDiagnosticError'
    this.diagnostics = diagnostics
  }
}

export interface AssetManifestEntry {
  readonly id: AssetId
  readonly type: AssetTypeId
  readonly path: string
  readonly dependencies: AssetRef[]
  readonly metadata: Record<string, unknown>
}

export const AssetManifestEntrySchema: z.ZodType<AssetManifestEntry, z.ZodTypeDef, unknown> =
  z.object({
    id: AssetIdSchema,
    type: AssetTypeIdSchema,
    path: z.string().min(1),
    dependencies: z.array(AssetRefSchema).default([]),
    metadata: z.record(z.unknown()).default({}),
  }) as unknown as z.ZodType<AssetManifestEntry, z.ZodTypeDef, unknown>

export interface ProjectManifest {
  readonly schemaVersion: 1
  readonly name: string
  readonly entryScene: AssetRef
  readonly assetsDir: string
  readonly scriptsDir: string
  readonly assets: AssetManifestEntry[]
}

export const ProjectManifestSchema: z.ZodType<ProjectManifest, z.ZodTypeDef, unknown> = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  entryScene: AssetRefSchema,
  assetsDir: z.string().min(1).default('public/assets'),
  scriptsDir: z.string().min(1).default('scripts'),
  assets: z.array(AssetManifestEntrySchema),
}) as unknown as z.ZodType<ProjectManifest, z.ZodTypeDef, unknown>

function formatZodPath(path: PropertyKey[]): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') return `${result}[${segment}]`
    return result ? `${result}.${String(segment)}` : String(segment)
  }, '')
}

export function validateProjectManifest(input: unknown): ProjectManifest {
  const parsed = ProjectManifestSchema.safeParse(input)
  if (!parsed.success) {
    throw new AssetDiagnosticError(
      parsed.error.issues.map((issue) => ({
        code: 'manifest.invalid',
        severity: 'error',
        message: `${formatZodPath(issue.path)}: ${issue.message}`,
        path: formatZodPath(issue.path),
      })),
    )
  }

  const seen = new Set<AssetId>()
  const diagnostics: AssetDiagnostic[] = []
  for (const [index, entry] of parsed.data.assets.entries()) {
    if (seen.has(entry.id)) {
      diagnostics.push({
        code: 'asset.duplicate-id',
        severity: 'error',
        message: `Duplicate asset ID: ${entry.id}`,
        assetId: entry.id,
        path: `assets[${index}].id`,
      })
    }
    seen.add(entry.id)
  }
  if (diagnostics.length > 0) throw new AssetDiagnosticError(diagnostics)
  return parsed.data
}

export interface AssetTypeDescriptor<T = unknown> {
  readonly type: AssetTypeId
  readonly name: string
  readonly schema: z.ZodType<T, z.ZodTypeDef, unknown>
  readonly dependencies: (value: T) => readonly AssetRef[]
}

export const BinaryAssetSchema = z.instanceof(Uint8Array)
export type BinaryAsset = z.infer<typeof BinaryAssetSchema>

export const DataAssetSchema = z.record(z.unknown())
export type DataAsset = z.infer<typeof DataAssetSchema>

export const MODEL_ASSET_DESCRIPTOR = {
  type: MODEL_ASSET_TYPE,
  name: 'Model',
  schema: BinaryAssetSchema,
  dependencies: () => [],
} satisfies AssetTypeDescriptor<BinaryAsset>

export const TEXTURE_ASSET_DESCRIPTOR = {
  type: TEXTURE_ASSET_TYPE,
  name: 'Texture',
  schema: BinaryAssetSchema,
  dependencies: () => [],
} satisfies AssetTypeDescriptor<BinaryAsset>

export const BINARY_ASSET_DESCRIPTOR = {
  type: BINARY_ASSET_TYPE,
  name: 'Binary',
  schema: BinaryAssetSchema,
  dependencies: () => [],
} satisfies AssetTypeDescriptor<BinaryAsset>

export const DATA_ASSET_DESCRIPTOR = {
  type: DATA_ASSET_TYPE,
  name: 'Data',
  schema: DataAssetSchema,
  dependencies: collectAssetReferences,
} satisfies AssetTypeDescriptor<DataAsset>

export const CUSTOM_COMPONENT_TYPE_ASSET_DESCRIPTOR = {
  type: CUSTOM_COMPONENT_TYPE_ASSET_TYPE,
  name: 'Component Type',
  schema: CustomComponentTypeAssetSchema,
  dependencies: collectAssetReferences,
} satisfies AssetTypeDescriptor<ParsedCustomComponentTypeAsset>

export class AssetRegistry {
  private readonly descriptors = new Map<AssetTypeId, AssetTypeDescriptor>()

  register<T>(descriptor: AssetTypeDescriptor<T>): void {
    if (this.descriptors.has(descriptor.type)) {
      throw new AssetDiagnosticError([
        {
          code: 'asset-type.duplicate-id',
          severity: 'error',
          message: `Duplicate asset type ID: ${descriptor.type}`,
          actualType: descriptor.type,
        },
      ])
    }
    this.descriptors.set(descriptor.type, descriptor as AssetTypeDescriptor)
  }

  get(type: AssetTypeId): AssetTypeDescriptor | undefined {
    return this.descriptors.get(type)
  }

  require(type: AssetTypeId): AssetTypeDescriptor {
    const descriptor = this.get(type)
    if (!descriptor) {
      throw new AssetDiagnosticError([
        {
          code: 'asset-type.unknown-id',
          severity: 'error',
          message: `Unknown asset type ID: ${type}`,
          expectedType: type,
        },
      ])
    }
    return descriptor
  }

  all(): readonly AssetTypeDescriptor[] {
    return [...this.descriptors.values()].sort((left, right) => left.type.localeCompare(right.type))
  }
}

export function registerBuiltinAssetTypes(registry: AssetRegistry): void {
  registry.register(MODEL_ASSET_DESCRIPTOR)
  registry.register(TEXTURE_ASSET_DESCRIPTOR)
  registry.register(BINARY_ASSET_DESCRIPTOR)
  registry.register(DATA_ASSET_DESCRIPTOR)
  registry.register(CUSTOM_COMPONENT_TYPE_ASSET_DESCRIPTOR)
}

export function collectAssetReferences(value: unknown): AssetRef[] {
  const references = new Map<AssetId, AssetRef>()
  const visit = (candidate: unknown): void => {
    const parsedReference = AssetRefSchema.safeParse(candidate)
    if (parsedReference.success) {
      references.set(parsedReference.data.$ref, parsedReference.data)
      return
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item)
      return
    }
    if (typeof candidate === 'object' && candidate !== null) {
      for (const item of Object.values(candidate)) visit(item)
    }
  }
  visit(value)
  return [...references.values()].sort((left, right) => left.$ref.localeCompare(right.$ref))
}

export class ProjectAssetIndex {
  private readonly entries: Map<AssetId, AssetManifestEntry>

  constructor(readonly manifest: ProjectManifest) {
    this.entries = new Map(manifest.assets.map((entry) => [entry.id, entry]))
  }

  get(id: AssetId): AssetManifestEntry | undefined {
    return this.entries.get(id)
  }

  require(reference: AssetRef, expectedType?: AssetTypeId): AssetManifestEntry {
    const entry = this.get(reference.$ref)
    const requiredType = expectedType ?? reference.type
    if (!entry) {
      throw new AssetDiagnosticError([
        {
          code: 'asset.unknown-id',
          severity: 'error',
          message: `Unknown asset ID: ${reference.$ref}`,
          assetId: reference.$ref,
          expectedType: requiredType,
        },
      ])
    }
    if (requiredType !== undefined && entry.type !== requiredType) {
      throw new AssetDiagnosticError([
        {
          code: 'asset.type-mismatch',
          severity: 'error',
          message: `Asset ${entry.id} has type ${entry.type}; expected ${requiredType}`,
          assetId: entry.id,
          expectedType: requiredType,
          actualType: entry.type,
        },
      ])
    }
    return entry
  }

  path(reference: AssetRef, expectedType?: AssetTypeId): string {
    return this.require(reference, expectedType).path
  }
}

export interface ProjectAssetComposition {
  readonly registry: AssetRegistry
  readonly index: ProjectAssetIndex
}

export function validateProjectAssetComposition(
  manifest: ProjectManifest,
  registry: AssetRegistry,
): ProjectAssetComposition {
  for (const entry of manifest.assets) registry.require(entry.type)

  const index = new ProjectAssetIndex(manifest)
  index.require(manifest.entryScene, SCENE_ASSET_TYPE)
  for (const entry of manifest.assets) {
    for (const reference of entry.dependencies) index.require(reference)
  }
  return { registry, index }
}

export function dependencyClosure(
  manifest: ProjectManifest,
  roots: readonly AssetRef[],
): AssetManifestEntry[] {
  const byId = new Map(manifest.assets.map((entry) => [entry.id, entry]))
  const state = new Map<AssetId, 'visiting' | 'visited'>()
  const output: AssetManifestEntry[] = []
  const diagnostics: AssetDiagnostic[] = []

  const visit = (reference: AssetRef): void => {
    const entry = byId.get(reference.$ref)
    if (!entry) {
      diagnostics.push({
        code: 'asset.unknown-id',
        severity: 'error',
        message: `Unknown asset ID: ${reference.$ref}`,
        assetId: reference.$ref,
        expectedType: reference.type,
      })
      return
    }
    if (reference.type !== undefined && reference.type !== entry.type) {
      diagnostics.push({
        code: 'asset.type-mismatch',
        severity: 'error',
        message: `Asset ${entry.id} has type ${entry.type}; expected ${reference.type}`,
        assetId: entry.id,
        expectedType: reference.type,
        actualType: entry.type,
      })
      return
    }

    const currentState = state.get(entry.id)
    if (currentState === 'visited') return
    if (currentState === 'visiting') {
      diagnostics.push({
        code: 'asset.dependency-cycle',
        severity: 'error',
        message: `Asset dependency cycle at ${entry.id}`,
        assetId: entry.id,
      })
      return
    }

    state.set(entry.id, 'visiting')
    for (const dependency of [...entry.dependencies].sort((left, right) =>
      left.$ref.localeCompare(right.$ref),
    )) {
      visit(dependency)
    }
    state.set(entry.id, 'visited')
    output.push(entry)
  }

  for (const root of [...roots].sort((left, right) => left.$ref.localeCompare(right.$ref))) {
    visit(root)
  }
  if (diagnostics.length > 0) throw new AssetDiagnosticError(diagnostics)
  return output
}
