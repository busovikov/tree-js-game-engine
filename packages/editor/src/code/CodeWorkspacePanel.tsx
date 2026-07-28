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
import './code-workspace-panel.css'

const GAMEPLAY_PATH = 'src/gameplay.ts'
const DEFAULT_GAMEPLAY_SOURCE = `export const gameplay = {
  start() {
    console.info('Haku gameplay started')
  },
}
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
}

function workspaceFiles(
  workspace: BrowserProjectWorkspace,
  tooling: BrowserProjectTooling,
): Readonly<Record<string, string>> {
  const files: Record<string, string> = { ...tooling.files }
  for (const path of workspace.listFiles()) files[path] = workspace.readText(path)
  return files
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
}: CodeWorkspacePanelProps) {
  const languageClient = useMemo(
    () => injectedLanguageClient ?? new TypeScriptLanguageClient(),
    [injectedLanguageClient],
  )
  const bundlerClient = useMemo(
    () => injectedBundlerClient ?? new BrowserBundlerClient(),
    [injectedBundlerClient],
  )
  const [revision, setRevision] = useState(0)
  const [activePath, setActivePath] = useState<string | null>(
    workspace.listFiles().includes(GAMEPLAY_PATH)
      ? GAMEPLAY_PATH
      : (workspace.listFiles().find((path) => path.endsWith('.ts')) ?? null),
  )
  const [diagnostics, setDiagnostics] = useState<readonly CodeEditorDiagnostic[]>([])
  const [status, setStatus] = useState('Ready')
  const [playSession, setPlaySession] = useState<CodePlaySession | null>(null)
  const denied = workspace.trustMode === 'imported-untrusted'
  const files = useMemo(
    () => workspaceFiles(workspace, tooling),
    [revision, tooling, workspace],
  )

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
      await workspace.createText(GAMEPLAY_PATH, DEFAULT_GAMEPLAY_SOURCE)
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
      const result = await languageClient.analyze({ files })
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
      const result = await workspace.saveText(activePath)
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
          projectId: workspace.projectId,
          trustMode: workspace.trustMode,
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
        trustMode: workspace.trustMode,
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

  return (
    <section className="haku-code-workspace" aria-label="Code workspace">
      <div className="haku-code-workspace__toolbar">
        <button type="button" disabled={denied} onClick={() => void createGameplay()}>
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
      </div>
      {denied && (
        <div className="haku-code-workspace__diagnostic" role="alert">
          <code>trust.untrusted-code</code>: Imported project code must be trusted before it
          can be compiled.
        </div>
      )}
      <div className="haku-code-workspace__body">
        {activePath ? (
          <>
            <div className="haku-code-workspace__path">{activePath}</div>
            <Suspense fallback={<div className="haku-code-workspace__empty">Loading editor…</div>}>
              <EditorProvider
                path={activePath}
                value={workspace.readText(activePath)}
                readOnly={denied || workspace.trustMode === 'built-in'}
                diagnostics={diagnostics}
                projectFiles={tooling.monacoFiles}
                onChange={(value) => {
                  workspace.editText(activePath, value)
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
