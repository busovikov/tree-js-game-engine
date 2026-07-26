import { z } from 'zod'
import {
  AssetIdSchema,
  AssetRefSchema,
  AssetTypeIdSchema,
  assetId,
  assetRef,
  assetTypeId,
  type AssetId,
  type AssetRef,
  type AssetTypeId,
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
    return [...this.descriptors.values()].sort((left, right) =>
      left.type.localeCompare(right.type),
    )
  }
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
