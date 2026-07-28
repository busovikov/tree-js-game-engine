export type BrowserProjectTrustMode = 'built-in' | 'local-trusted' | 'imported-untrusted'

export type BrowserProjectCapability =
  | 'network'
  | 'local-save'
  | 'cloud-save'
  | 'audio'
  | 'fullscreen'
  | 'clipboard'
  | 'external-url'
  | 'platform-sdk'

export interface BrowserProjectCapabilityManifest {
  readonly requested: readonly BrowserProjectCapability[]
  readonly approved: readonly BrowserProjectCapability[]
}

export interface BrowserProjectBuildRequest {
  readonly projectId: string
  readonly trustMode: BrowserProjectTrustMode
  readonly files: Readonly<Record<string, string>>
  readonly capabilities: BrowserProjectCapabilityManifest
}

export interface TrustedBrowserProjectBuildRequest extends BrowserProjectBuildRequest {
  readonly trustMode: 'built-in' | 'local-trusted'
}

export interface BrowserProjectBundles {
  readonly gameplay: string
  readonly editorExtension: string
}

export interface BrowserBuildWorker {
  build(request: TrustedBrowserProjectBuildRequest): Promise<BrowserProjectBundles>
}

export interface BrowserBuildDiagnostic {
  readonly code: 'trust.untrusted-code' | 'trust.capability-not-approved' | 'build.failed'
  readonly kind: 'trust' | 'build'
  readonly severity: 'error'
  readonly message: string
  readonly capability?: BrowserProjectCapability
}

export type BrowserProjectBuildResult =
  | {
      readonly ok: true
      readonly bundles: BrowserProjectBundles
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly BrowserBuildDiagnostic[]
    }

const UNTRUSTED_DIAGNOSTIC: BrowserBuildDiagnostic = {
  code: 'trust.untrusted-code',
  kind: 'trust',
  severity: 'error',
  message: 'Imported project code must be trusted before it can be compiled.',
}

export async function buildBrowserProject(
  request: BrowserProjectBuildRequest,
  worker: BrowserBuildWorker,
): Promise<BrowserProjectBuildResult> {
  if (request.trustMode === 'imported-untrusted') {
    return {
      ok: false,
      diagnostics: [UNTRUSTED_DIAGNOSTIC],
    }
  }

  const approved = new Set(request.capabilities.approved)
  const deniedCapability = request.capabilities.requested.find(
    (capability) => !approved.has(capability),
  )
  if (deniedCapability) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'trust.capability-not-approved',
          kind: 'trust',
          severity: 'error',
          capability: deniedCapability,
          message: `Capability "${deniedCapability}" requires approval for this project.`,
        },
      ],
    }
  }

  const trustedRequest: TrustedBrowserProjectBuildRequest = {
    ...request,
    trustMode: request.trustMode,
  }
  const bundles = await worker.build(trustedRequest)
  return {
    ok: true,
    bundles,
    diagnostics: [],
  }
}
