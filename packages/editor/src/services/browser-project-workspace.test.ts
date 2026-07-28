import { describe, expect, it, vi } from 'vitest'
import {
  BrowserProjectWorkspace,
  type BrowserProjectDiskFile,
  type BrowserProjectFileSystem,
} from './browser-project-workspace.js'

class FakeProjectFileSystem implements BrowserProjectFileSystem {
  readonly files = new Map<string, BrowserProjectDiskFile>()
  readonly writes: Array<{ path: string; text: string }> = []

  constructor(files: Record<string, string>) {
    for (const [path, text] of Object.entries(files)) {
      this.files.set(path, this.diskFile(text, 1))
    }
  }

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
    const file = this.diskFile(text, (previous?.lastModified ?? 0) + 1)
    this.files.set(path, file)
    this.writes.push({ path, text })
    return file
  }

  externalWrite(path: string, text: string): void {
    const previous = this.files.get(path)
    this.files.set(path, this.diskFile(text, (previous?.lastModified ?? 0) + 1))
  }

  private diskFile(text: string, lastModified: number): BrowserProjectDiskFile {
    return { text, lastModified, size: new Blob([text]).size }
  }
}

describe('BrowserProjectWorkspace external changes', () => {
  it('reloads a clean file when polling detects an external edit', async () => {
    const disk = new FakeProjectFileSystem({ 'src/node.ts': 'export const speed = 1' })
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'project-local',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    disk.externalWrite('src/node.ts', 'export const speed = 2')

    const changes = await workspace.pollExternalChanges()

    expect(changes).toEqual([{ path: 'src/node.ts', status: 'reloaded' }])
    expect(workspace.readText('src/node.ts')).toBe('export const speed = 2')
    expect(workspace.getConflict('src/node.ts')).toBeUndefined()
  })

  it('preserves dirty editor text and reports a conflict instead of overwriting', async () => {
    const disk = new FakeProjectFileSystem({ 'src/node.ts': 'export const speed = 1' })
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'project-local',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    workspace.editText('src/node.ts', 'export const speed = 3')
    disk.externalWrite('src/node.ts', 'export const speed = 2')

    const changes = await workspace.pollExternalChanges()

    expect(changes).toEqual([{ path: 'src/node.ts', status: 'conflict' }])
    expect(workspace.readText('src/node.ts')).toBe('export const speed = 3')
    expect(workspace.getConflict('src/node.ts')).toMatchObject({
      diskText: 'export const speed = 2',
      editorText: 'export const speed = 3',
    })
  })

  it('checks the disk revision again before save and never overwrites a conflict', async () => {
    const disk = new FakeProjectFileSystem({ 'src/node.ts': 'export const speed = 1' })
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'project-local',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    workspace.editText('src/node.ts', 'export const speed = 3')
    disk.externalWrite('src/node.ts', 'export const speed = 2')

    const result = await workspace.saveText('src/node.ts')

    expect(result).toEqual({ status: 'conflict', path: 'src/node.ts' })
    expect(disk.writes).toEqual([])
    expect(disk.files.get('src/node.ts')?.text).toBe('export const speed = 2')
  })

  it('resolves a conflict only through an explicit disk or editor choice', async () => {
    const disk = new FakeProjectFileSystem({ 'src/node.ts': 'export const speed = 1' })
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'project-local',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    workspace.editText('src/node.ts', 'export const speed = 3')
    disk.externalWrite('src/node.ts', 'export const speed = 2')
    await workspace.pollExternalChanges()

    workspace.resolveConflict('src/node.ts', 'keep-editor')
    const save = await workspace.saveText('src/node.ts')

    expect(save).toEqual({ status: 'saved', path: 'src/node.ts' })
    expect(disk.files.get('src/node.ts')?.text).toBe('export const speed = 3')
    expect(workspace.getConflict('src/node.ts')).toBeUndefined()
  })

  it('accepting disk text updates the watcher baseline without reporting it twice', async () => {
    const disk = new FakeProjectFileSystem({ 'src/node.ts': 'export const speed = 1' })
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'project-local',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    workspace.editText('src/node.ts', 'export const speed = 3')
    disk.externalWrite('src/node.ts', 'export const speed = 2')
    await workspace.pollExternalChanges()

    workspace.resolveConflict('src/node.ts', 'reload-disk')

    expect(workspace.readText('src/node.ts')).toBe('export const speed = 2')
    expect(await workspace.pollExternalChanges()).toEqual([])
  })

  it('polls through a disposable watcher and stops scheduling after dispose', async () => {
    vi.useFakeTimers()
    const disk = new FakeProjectFileSystem({ 'src/node.ts': 'export const speed = 1' })
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'project-local',
      trustMode: 'local-trusted',
      fileSystem: disk,
    })
    const onChanges = vi.fn()
    const watcher = workspace.watchExternalChanges(onChanges, 250)
    disk.externalWrite('src/node.ts', 'export const speed = 2')

    await vi.advanceTimersByTimeAsync(250)
    watcher.dispose()
    disk.externalWrite('src/node.ts', 'export const speed = 3')
    await vi.advanceTimersByTimeAsync(250)

    expect(onChanges).toHaveBeenCalledTimes(1)
    expect(onChanges).toHaveBeenCalledWith([{ path: 'src/node.ts', status: 'reloaded' }])
    vi.useRealTimers()
  })
})

describe('BrowserProjectWorkspace built-in projects', () => {
  it('keeps built-ins read-only and forks every file to local trusted storage', async () => {
    const builtIn = new FakeProjectFileSystem({
      'haku.project.json': '{"name":"Starter"}',
      'src/node.ts': 'export const speed = 1',
    })
    const destination = new FakeProjectFileSystem({})
    const workspace = await BrowserProjectWorkspace.open({
      projectId: 'starter',
      trustMode: 'built-in',
      fileSystem: builtIn,
    })

    expect(() => workspace.editText('src/node.ts', 'changed')).toThrow(
      'Built-in projects are read-only. Fork the project to edit it.',
    )

    const fork = await workspace.forkToDisk('project-fork', destination)

    expect(fork.trustMode).toBe('local-trusted')
    expect(fork.projectId).toBe('project-fork')
    expect(destination.writes).toEqual([
      { path: 'haku.project.json', text: '{"name":"Starter"}' },
      { path: 'src/node.ts', text: 'export const speed = 1' },
    ])
  })
})
