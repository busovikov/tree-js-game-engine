/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  BrowserProjectBundles,
  BrowserProjectTooling,
  TypeScriptLanguageRequest,
  TypeScriptLanguageResult,
} from '@haku/build'
import {
  BrowserProjectWorkspace,
  type BrowserProjectDiskFile,
  type BrowserProjectFileSystem,
} from '../services/browser-project-workspace.js'
import type { CodeEditorProvider } from './code-editor-provider.js'
import { CodeWorkspacePanel } from './CodeWorkspacePanel.js'

class FakeProjectFileSystem implements BrowserProjectFileSystem {
  readonly files = new Map<string, BrowserProjectDiskFile>()
  readonly writes: Array<{ path: string; text: string }> = []

  async listFiles(): Promise<readonly string[]> {
    return [...this.files.keys()]
  }

  async readFile(path: string): Promise<BrowserProjectDiskFile> {
    const file = this.files.get(path)
    if (!file) throw new Error(`File not found: ${path}`)
    return file
  }

  async writeFile(path: string, text: string): Promise<BrowserProjectDiskFile> {
    const previous = this.files.get(path)
    const file = {
      text,
      lastModified: (previous?.lastModified ?? 0) + 1,
      size: new Blob([text]).size,
    }
    this.files.set(path, file)
    this.writes.push({ path, text })
    return file
  }
}

const TOOLING: BrowserProjectTooling = {
  files: Object.freeze({
    'tsconfig.json': '{"compilerOptions":{"strict":true}}\n',
    '.haku/generated/engine.d.ts': 'declare const engineVersion: string\n',
  }),
  monacoFiles: Object.freeze({
    'tsconfig.json': '{"compilerOptions":{"strict":true}}\n',
    '.haku/generated/engine.d.ts': 'declare const engineVersion: string\n',
  }),
  vsCodeFiles: Object.freeze({
    'tsconfig.json': '{"compilerOptions":{"strict":true}}\n',
    '.haku/generated/engine.d.ts': 'declare const engineVersion: string\n',
  }),
}

const TextareaEditor: CodeEditorProvider = ({ value, onChange, readOnly }) => (
  <textarea
    aria-label="Code editor"
    value={value}
    readOnly={readOnly}
    onChange={(event) => onChange(event.currentTarget.value)}
  />
)

afterEach(cleanup)

describe('CodeWorkspacePanel', () => {
  it('creates, edits, diagnoses, saves, builds, and launches only the gameplay bundle', async () => {
    const disk = new FakeProjectFileSystem()
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'local-project',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    const languageClient = {
      analyze: vi.fn(
        async (_request: TypeScriptLanguageRequest): Promise<TypeScriptLanguageResult> => ({
          diagnostics: [],
          completions: [],
        }),
      ),
      dispose: vi.fn(),
    }
    const bundles: BrowserProjectBundles = {
      gameplay: 'globalThis.hakuGameplayRan = true',
      editorExtension: 'throw new Error("editor extension must not run in Play")',
    }
    const bundlerClient = {
      build: vi.fn(async () => bundles),
      dispose: vi.fn(),
    }
    const playSession = {
      completion: Promise.resolve({ type: 'haku-play:success' as const }),
      dispose: vi.fn(),
    }
    const launchPlay = vi.fn(() => playSession)

    render(
      <CodeWorkspacePanel
        workspace={workspace}
        tooling={TOOLING}
        EditorProvider={TextareaEditor}
        languageClient={languageClient}
        bundlerClient={bundlerClient}
        launchPlay={launchPlay}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create src/gameplay.ts' }))
    await screen.findByRole('textbox', { name: 'Code editor' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Code editor' }), {
      target: { value: 'export const customNode = { speed: 3 }\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }))
    await waitFor(() => expect(languageClient.analyze).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(disk.files.get('src/gameplay.ts')?.text).toBe(
        'export const customNode = { speed: 3 }\n',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Build and Play' }))
    await waitFor(() => expect(launchPlay).toHaveBeenCalledTimes(1))

    expect(languageClient.analyze).toHaveBeenCalledWith({
      files: {
        ...TOOLING.files,
        'src/gameplay.ts': 'export const customNode = { speed: 3 }\n',
      },
    })
    expect(bundlerClient.build).toHaveBeenCalledWith({
      files: {
        ...TOOLING.files,
        'src/gameplay.ts': 'export const customNode = { speed: 3 }\n',
      },
    })
    expect(launchPlay).toHaveBeenCalledWith({
      trustMode: 'local-trusted',
      bundle: bundles.gameplay,
      approvedCapabilities: {},
    })
    expect(launchPlay.mock.calls[0]?.[0]).not.toHaveProperty('editorExtension')
    expect(screen.getByRole('status').textContent).toContain('Play completed')
  })

  it('renders typed trust denial before creating language, bundler, or Play work', async () => {
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'imported-project',
      trustMode: 'imported-untrusted',
      fileSystem: new FakeProjectFileSystem(),
    })
    const languageClient = { analyze: vi.fn(), dispose: vi.fn() }
    const bundlerClient = { build: vi.fn(), dispose: vi.fn() }
    const launchPlay = vi.fn()

    render(
      <CodeWorkspacePanel
        workspace={workspace}
        tooling={TOOLING}
        EditorProvider={TextareaEditor}
        languageClient={languageClient}
        bundlerClient={bundlerClient}
        launchPlay={launchPlay}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('trust.untrusted-code')
    expect(
      (screen.getByRole('button', { name: 'Create src/gameplay.ts' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect((screen.getByRole('button', { name: 'Diagnose' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      (screen.getByRole('button', { name: 'Build and Play' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(languageClient.analyze).not.toHaveBeenCalled()
    expect(bundlerClient.build).not.toHaveBeenCalled()
    expect(launchPlay).not.toHaveBeenCalled()
  })
})
