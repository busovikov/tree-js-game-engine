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

const GAMEPLAY_PATH = 'src/gameplay.ts'

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

  externalWrite(path: string, text: string): void {
    const previous = this.files.get(path)
    this.files.set(path, {
      text,
      lastModified: (previous?.lastModified ?? 0) + 10,
      size: new Blob([text]).size,
    })
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

  it('never selects generated declarations as the editable project source', async () => {
    const disk = new FakeProjectFileSystem()
    await disk.writeFile(
      '.haku/generated/engine.d.ts',
      'declare const engineVersion: string\n',
    )
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'built-in-project',
      trustMode: 'built-in',
      fileSystem: disk,
    })

    render(
      <CodeWorkspacePanel
        workspace={workspace}
        tooling={TOOLING}
        EditorProvider={TextareaEditor}
        languageClient={{ analyze: vi.fn(), dispose: vi.fn() }}
        bundlerClient={{ build: vi.fn(), dispose: vi.fn() }}
        launchPlay={vi.fn()}
        forkWorkspace={vi.fn()}
      />,
    )

    expect(screen.queryByRole('textbox', { name: 'Code editor' })).toBeNull()
    expect(screen.getByText('No TypeScript source — create src/gameplay.ts')).toBeTruthy()
  })

  it('feeds Monaco only TypeScript models while keeping non-source files out', async () => {
    const disk = new FakeProjectFileSystem()
    await disk.writeFile(GAMEPLAY_PATH, 'export const speed = 1\n')
    await disk.writeFile('public/assets/scenes/main.scene.json', '{"schemaVersion":1}\n')
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'local-project',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    const observedProjectFiles: Array<Readonly<Record<string, string>> | undefined> = []
    const ObservingEditor: CodeEditorProvider = (props) => {
      observedProjectFiles.push(props.projectFiles)
      return <textarea aria-label="Code editor" value={props.value} readOnly />
    }

    render(
      <CodeWorkspacePanel
        workspace={workspace}
        tooling={TOOLING}
        EditorProvider={ObservingEditor}
        languageClient={{ analyze: vi.fn(), dispose: vi.fn() }}
        bundlerClient={{ build: vi.fn(), dispose: vi.fn() }}
        launchPlay={vi.fn()}
      />,
    )

    expect(Object.keys(observedProjectFiles.at(-1) ?? {}).sort()).toEqual([
      '.haku/generated/engine.d.ts',
      'src/gameplay.ts',
    ])
  })

  it('renders typed capability denial before creating bundler or Play work', async () => {
    const disk = new FakeProjectFileSystem()
    await disk.writeFile(GAMEPLAY_PATH, 'export const speed = 1\n')
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'local-project',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    const bundlerClient = { build: vi.fn(), dispose: vi.fn() }
    const launchPlay = vi.fn()

    render(
      <CodeWorkspacePanel
        workspace={workspace}
        tooling={TOOLING}
        EditorProvider={TextareaEditor}
        languageClient={{ analyze: vi.fn(), dispose: vi.fn() }}
        bundlerClient={bundlerClient}
        launchPlay={launchPlay}
        capabilities={{ requested: ['network'], approved: [] }}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'trust.capability-not-approved',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Build and Play' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'trust.capability-not-approved',
      ),
    )
    expect(bundlerClient.build).not.toHaveBeenCalled()
    expect(launchPlay).not.toHaveBeenCalled()
  })

  it('forks a built-in project and resolves external edits only through visible choices', async () => {
    const builtInDisk = new FakeProjectFileSystem()
    await builtInDisk.writeFile(GAMEPLAY_PATH, 'export const speed = 1\n')
    const builtIn = await BrowserProjectWorkspace.open({
      projectId: 'built-in-project',
      trustMode: 'built-in',
      fileSystem: builtInDisk,
    })
    const forkDisk = new FakeProjectFileSystem()
    const forkWorkspace = vi.fn(() => builtIn.forkToDisk('forked-project', forkDisk))

    render(
      <CodeWorkspacePanel
        workspace={builtIn}
        tooling={TOOLING}
        EditorProvider={TextareaEditor}
        languageClient={{ analyze: vi.fn(), dispose: vi.fn() }}
        bundlerClient={{ build: vi.fn(), dispose: vi.fn() }}
        launchPlay={vi.fn()}
        forkWorkspace={forkWorkspace}
      />,
    )

    expect((screen.getByRole('textbox', { name: 'Code editor' }) as HTMLTextAreaElement).readOnly).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fork to disk' }))
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'Code editor' }) as HTMLTextAreaElement).readOnly,
      ).toBe(false),
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Code editor' }), {
      target: { value: 'export const speed = 3\n' },
    })
    forkDisk.externalWrite(GAMEPLAY_PATH, 'export const speed = 2\n')
    fireEvent.click(screen.getByRole('button', { name: 'Reload external changes' }))

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toContain('External conflict')
    expect((screen.getByRole('textbox', { name: 'Code editor' }) as HTMLTextAreaElement).value).toBe(
      'export const speed = 3\n',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use disk changes' }))
    expect((screen.getByRole('textbox', { name: 'Code editor' }) as HTMLTextAreaElement).value).toBe(
      'export const speed = 2\n',
    )
    expect(forkWorkspace).toHaveBeenCalledTimes(1)
  })

  it('opens external VS Code only for an explicit absolute path', async () => {
    const disk = new FakeProjectFileSystem()
    await disk.writeFile(GAMEPLAY_PATH, 'export const speed = 1\n')
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'local-project',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    const openExternalVsCode = vi.fn()

    render(
      <CodeWorkspacePanel
        workspace={workspace}
        tooling={TOOLING}
        EditorProvider={TextareaEditor}
        languageClient={{ analyze: vi.fn(), dispose: vi.fn() }}
        bundlerClient={{ build: vi.fn(), dispose: vi.fn() }}
        launchPlay={vi.fn()}
        openExternalVsCode={openExternalVsCode}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Absolute project path' }), {
      target: { value: 'relative/project' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open in VS Code' }))
    expect(screen.getByRole('status').textContent).toContain('absolute project path')
    expect(openExternalVsCode).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Absolute project path' }), {
      target: { value: '/Users/me/project' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open in VS Code' }))
    expect(openExternalVsCode).toHaveBeenCalledWith('/Users/me/project')
  })

  it.each([
    {
      result: { type: 'haku-play:crash' as const, message: 'Play crashed' },
      expected: 'Play crashed',
    },
    {
      result: { type: 'haku-play:timeout' as const, message: 'Play timed out' },
      expected: 'Play timed out',
    },
  ])('recovers editor state after $result.type', async ({ result, expected }) => {
    const disk = new FakeProjectFileSystem()
    await disk.writeFile(GAMEPLAY_PATH, 'export const speed = 1\n')
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'local-project',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    const launchPlay = vi.fn(() => ({
      completion: Promise.resolve(result),
      dispose: vi.fn(),
    }))

    render(
      <CodeWorkspacePanel
        workspace={workspace}
        tooling={TOOLING}
        EditorProvider={TextareaEditor}
        languageClient={{ analyze: vi.fn(), dispose: vi.fn() }}
        bundlerClient={{
          build: vi.fn(async () => ({ gameplay: 'gameplay', editorExtension: 'editor' })),
          dispose: vi.fn(),
        }}
        launchPlay={launchPlay}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Code editor' }), {
      target: { value: 'export const speed = 7\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Build and Play' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(expected))
    expect((screen.getByRole('textbox', { name: 'Code editor' }) as HTMLTextAreaElement).value).toBe(
      'export const speed = 7\n',
    )
  })

  it('stops a running disposable Play session without losing editor text', async () => {
    const disk = new FakeProjectFileSystem()
    await disk.writeFile(GAMEPLAY_PATH, 'export const speed = 1\n')
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'local-project',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    const dispose = vi.fn()
    const launchPlay = vi.fn(() => ({
      completion: new Promise<never>(() => undefined),
      dispose,
    }))

    render(
      <CodeWorkspacePanel
        workspace={workspace}
        tooling={TOOLING}
        EditorProvider={TextareaEditor}
        languageClient={{ analyze: vi.fn(), dispose: vi.fn() }}
        bundlerClient={{
          build: vi.fn(async () => ({ gameplay: 'gameplay', editorExtension: 'editor' })),
          dispose: vi.fn(),
        }}
        launchPlay={launchPlay}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Code editor' }), {
      target: { value: 'export const speed = 8\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Build and Play' }))
    await waitFor(
      () =>
        expect((screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(
          false,
        ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(dispose).toHaveBeenCalled()
    expect((screen.getByRole('textbox', { name: 'Code editor' }) as HTMLTextAreaElement).value).toBe(
      'export const speed = 8\n',
    )
    expect(screen.getByRole('status').textContent).toContain('Play stopped')
  })
})
