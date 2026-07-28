import {
  BrowserBundlerClient,
  TypeScriptLanguageClient,
  buildBrowserProject,
  type BrowserProjectCapabilityManifest,
  type BrowserProjectTooling,
  type BrowserBundleRequest,
  type BrowserProjectBundles,
  type TypeScriptLanguageRequest,
  type TypeScriptLanguageResult,
} from '@haku/build'
import { memo, Suspense, useEffect, useMemo, useState } from 'react'
import type { BrowserProjectWorkspace } from '../services/browser-project-workspace.js'
import {
  DefaultCodeEditorProvider,
  type CodeEditorDiagnostic,
  type CodeEditorProvider,
} from './code-editor-provider.js'
import {
  createPlaySandbox,
  type PlayCapabilityValue,
  type PlaySandboxOptions,
  type PlaySandboxResult,
} from './play-sandbox.js'
import { openProjectInExternalVsCode } from './external-vscode.js'
import './code-workspace-panel.css'

const GAMEPLAY_PATH = 'src/gameplay.ts'
const DEFAULT_GAMEPLAY_SOURCE = `import { defineCustomNode } from '@haku/node-sdk'

export const gameplay = defineCustomNode({
  id: 'gameplay',
  run() {
    return undefined
  },
})

gameplay.run?.()
`

export interface CodeLanguageClient {
  analyze(request: TypeScriptLanguageRequest): Promise<TypeScriptLanguageResult>
  dispose(): void
}

export interface CodeBundlerClient {
  build(request: BrowserBundleRequest): Promise<BrowserProjectBundles>
  dispose(): void
}

export interface CodePlaySession {
  readonly completion: Promise<PlaySandboxResult>
  dispose(): void
}

export type CodePlayLauncher = (
  options: Pick<
    PlaySandboxOptions,
    'trustMode' | 'bundle' | 'approvedCapabilities'
  >,
) => CodePlaySession

export interface CodeWorkspacePanelProps {
  readonly workspace: BrowserProjectWorkspace
  readonly tooling: BrowserProjectTooling
  readonly EditorProvider?: CodeEditorProvider
  readonly languageClient?: CodeLanguageClient
  readonly bundlerClient?: CodeBundlerClient
  readonly launchPlay?: CodePlayLauncher
  readonly capabilities?: BrowserProjectCapabilityManifest
  readonly forkWorkspace?: () => Promise<BrowserProjectWorkspace>
  readonly openExternalVsCode?: (absoluteProjectPath: string) => unknown
}

function workspaceFiles(
  workspace: BrowserProjectWorkspace,
  tooling: BrowserProjectTooling,
): Readonly<Record<string, string>> {
  const files: Record<string, string> = { ...tooling.files }
  for (const path of workspace.listFiles()) files[path] = workspace.readText(path)
  return files
}

function initialSourcePath(workspace: BrowserProjectWorkspace): string | null {
  const paths = workspace.listFiles()
  if (paths.includes(GAMEPLAY_PATH)) return GAMEPLAY_PATH
  return (
    paths.find(
      (path) =>
        path.startsWith('src/') &&
        !path.endsWith('.d.ts') &&
        /\.(?:ts|tsx)$/.test(path),
    ) ?? null
  )
}

function monacoTypeScriptFiles(
  files: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(files).filter(([path]) => /\.[cm]?tsx?$/.test(path)),
  )
}

function approvedCapabilityData(
  capabilities: BrowserProjectCapabilityManifest,
): Readonly<Record<string, PlayCapabilityValue>> {
  return Object.fromEntries(capabilities.approved.map((capability) => [capability, true]))
}

function toEditorDiagnostics(
  result: TypeScriptLanguageResult,
  path: string,
): readonly CodeEditorDiagnostic[] {
  return result.diagnostics
    .filter((diagnostic) => !diagnostic.path || diagnostic.path === path)
    .map((diagnostic) => ({
      message: diagnostic.message,
      severity: diagnostic.severity,
    }))
}

export const CodeWorkspacePanel = memo(function CodeWorkspacePanel({
  workspace,
  tooling,
  EditorProvider = DefaultCodeEditorProvider,
  languageClient: injectedLanguageClient,
  bundlerClient: injectedBundlerClient,
  launchPlay = createPlaySandbox,
  capabilities = { requested: [], approved: [] },
  forkWorkspace,
  openExternalVsCode = openProjectInExternalVsCode,
}: CodeWorkspacePanelProps) {
  const languageClient = useMemo(
    () => injectedLanguageClient ?? new TypeScriptLanguageClient(),
    [injectedLanguageClient],
  )
  const bundlerClient = useMemo(
    () => injectedBundlerClient ?? new BrowserBundlerClient(),
    [injectedBundlerClient],
  )
  const [currentWorkspace, setCurrentWorkspace] = useState(workspace)
  const [revision, setRevision] = useState(0)
  const [activePath, setActivePath] = useState<string | null>(
    initialSourcePath(workspace),
  )
  const [diagnostics, setDiagnostics] = useState<readonly CodeEditorDiagnostic[]>([])
  const [status, setStatus] = useState('Ready')
  const [playSession, setPlaySession] = useState<CodePlaySession | null>(null)
  const [absoluteProjectPath, setAbsoluteProjectPath] = useState('')
  const denied = currentWorkspace.trustMode === 'imported-untrusted'
  const readOnly = denied || currentWorkspace.trustMode === 'built-in'
  const deniedCapability = capabilities.requested.find(
    (capability) => !capabilities.approved.includes(capability),
  )
  const conflict = activePath ? currentWorkspace.getConflict(activePath) : undefined
  const files = useMemo(
    () => workspaceFiles(currentWorkspace, tooling),
    [currentWorkspace, revision, tooling],
  )
  const monacoFiles = useMemo(() => monacoTypeScriptFiles(files), [files])

  useEffect(() => {
    setCurrentWorkspace(workspace)
    setActivePath(initialSourcePath(workspace))
    setRevision((value) => value + 1)
  }, [workspace])
  useEffect(() => {
    const watcher = currentWorkspace.watchExternalChanges((changes) => {
      const changed = changes.find((change) => change.path === activePath) ?? changes[0]
      if (changed) {
        setStatus(
          changed.status === 'conflict'
            ? `External conflict in ${changed.path}`
            : `Reloaded ${changed.path} from disk`,
        )
        setRevision((value) => value + 1)
      }
    })
    return () => watcher.dispose()
  }, [activePath, currentWorkspace])
  useEffect(
    () => () => {
      playSession?.dispose()
    },
    [playSession],
  )
  useEffect(
    () => () => {
      if (!injectedLanguageClient) languageClient.dispose()
      if (!injectedBundlerClient) bundlerClient.dispose()
    },
    [
      bundlerClient,
      injectedBundlerClient,
      injectedLanguageClient,
      languageClient,
    ],
  )

  const createGameplay = async () => {
    try {
      await currentWorkspace.createText(GAMEPLAY_PATH, DEFAULT_GAMEPLAY_SOURCE)
      setActivePath(GAMEPLAY_PATH)
      setRevision((value) => value + 1)
      setStatus(`Created ${GAMEPLAY_PATH}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  const diagnose = async () => {
    if (!activePath || denied) return
    try {
      const result = await languageClient.analyze({
        files,
        diagnosticPaths: [activePath],
      })
      setDiagnostics(toEditorDiagnostics(result, activePath))
      setStatus(
        result.diagnostics.length === 0
          ? 'No TypeScript diagnostics'
          : `${result.diagnostics.length} TypeScript diagnostic(s)`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  const save = async () => {
    if (!activePath || denied) return
    try {
      const result = await currentWorkspace.saveText(activePath)
      setStatus(
        result.status === 'saved'
          ? `Saved ${activePath}`
          : `External conflict in ${activePath}`,
      )
      setRevision((value) => value + 1)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  const buildAndPlay = async () => {
    if (!activePath || denied) return
    playSession?.dispose()
    setPlaySession(null)
    setStatus('Building gameplay')
    try {
      const result = await buildBrowserProject(
        {
          projectId: currentWorkspace.projectId,
          trustMode: currentWorkspace.trustMode,
          files,
          capabilities,
        },
        {
          build: () => bundlerClient.build({ files }),
        },
      )
      if (!result.ok) {
        setStatus(result.diagnostics.map((diagnostic) => diagnostic.code).join(', '))
        return
      }
      const session = launchPlay({
        trustMode: currentWorkspace.trustMode,
        bundle: result.bundles.gameplay,
        approvedCapabilities: approvedCapabilityData(capabilities),
      })
      setPlaySession(session)
      setStatus('Play running')
      const completion = await session.completion
      setPlaySession(null)
      setStatus(
        completion.type === 'haku-play:success'
          ? 'Play completed'
          : completion.message,
      )
    } catch (error) {
      setPlaySession(null)
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  const stopPlay = () => {
    playSession?.dispose()
    setPlaySession(null)
    setStatus('Play stopped')
  }

  const forkToDisk = async () => {
    if (!forkWorkspace) return
    try {
      const forked = await forkWorkspace()
      setCurrentWorkspace(forked)
      setActivePath(initialSourcePath(forked))
      setRevision((value) => value + 1)
      setStatus(`Forked ${forked.projectId} to local trusted storage`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  const reloadExternalChanges = async () => {
    try {
      const changes = await currentWorkspace.pollExternalChanges()
      const changed = changes.find((change) => change.path === activePath) ?? changes[0]
      setStatus(
        !changed
          ? 'No external changes'
          : changed.status === 'conflict'
            ? `External conflict in ${changed.path}`
            : `Reloaded ${changed.path} from disk`,
      )
      setRevision((value) => value + 1)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  const resolveConflict = (resolution: 'reload-disk' | 'keep-editor') => {
    if (!activePath) return
    currentWorkspace.resolveConflict(activePath, resolution)
    setRevision((value) => value + 1)
    setStatus(
      resolution === 'reload-disk'
        ? `Using disk changes for ${activePath}`
        : `Keeping editor changes for ${activePath}`,
    )
  }

  const openVsCode = () => {
    try {
      if (!absoluteProjectPath.startsWith('/')) {
        throw new Error('An absolute project path is required to open external VS Code.')
      }
      openExternalVsCode(absoluteProjectPath)
      setStatus('Opened project in external VS Code')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <section className="haku-code-workspace" aria-label="Code workspace">
      <div className="haku-code-workspace__toolbar">
        <button type="button" disabled={readOnly} onClick={() => void createGameplay()}>
          Create {GAMEPLAY_PATH}
        </button>
        <button type="button" disabled={denied || !activePath} onClick={() => void diagnose()}>
          Diagnose
        </button>
        <button type="button" disabled={denied || !activePath} onClick={() => void save()}>
          Save
        </button>
        <button
          type="button"
          disabled={denied || !activePath}
          onClick={() => void buildAndPlay()}
        >
          Build and Play
        </button>
        <button type="button" disabled={!playSession} onClick={stopPlay}>
          Stop
        </button>
        <button type="button" onClick={() => void reloadExternalChanges()}>
          Reload external changes
        </button>
        {currentWorkspace.trustMode === 'built-in' && (
          <button type="button" disabled={!forkWorkspace} onClick={() => void forkToDisk()}>
            Fork to disk
          </button>
        )}
      </div>
      {denied && (
        <div className="haku-code-workspace__diagnostic" role="alert">
          <code>trust.untrusted-code</code>: Imported project code must be trusted before it
          can be compiled.
        </div>
      )}
      {!denied && deniedCapability && (
        <div className="haku-code-workspace__diagnostic" role="alert">
          <code>trust.capability-not-approved</code>: Capability {deniedCapability} requires
          local approval.
        </div>
      )}
      {conflict && (
        <div className="haku-code-workspace__conflict" role="alert">
          <span>External conflict in {conflict.path}</span>
          <button type="button" onClick={() => resolveConflict('reload-disk')}>
            Use disk changes
          </button>
          <button type="button" onClick={() => resolveConflict('keep-editor')}>
            Keep editor changes
          </button>
        </div>
      )}
      <div className="haku-code-workspace__external">
        <label>
          Absolute project path
          <input
            aria-label="Absolute project path"
            value={absoluteProjectPath}
            placeholder="/absolute/path/to/project"
            onChange={(event) => setAbsoluteProjectPath(event.currentTarget.value)}
          />
        </label>
        <button type="button" onClick={openVsCode}>
          Open in VS Code
        </button>
      </div>
      <div className="haku-code-workspace__body">
        {activePath ? (
          <>
            <div className="haku-code-workspace__path">{activePath}</div>
            <Suspense fallback={<div className="haku-code-workspace__empty">Loading editor…</div>}>
              <EditorProvider
                path={activePath}
                value={currentWorkspace.readText(activePath)}
                readOnly={readOnly}
                diagnostics={diagnostics}
                projectFiles={monacoFiles}
                onChange={(value) => {
                  currentWorkspace.editText(activePath, value)
                  setRevision((current) => current + 1)
                }}
              />
            </Suspense>
          </>
        ) : (
          <div className="haku-code-workspace__empty">
            No TypeScript source — create {GAMEPLAY_PATH}
          </div>
        )}
      </div>
      <div className="haku-code-workspace__status" role="status">
        {status}
      </div>
    </section>
  )
})
