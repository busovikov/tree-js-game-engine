import type { BrowserProjectTrustMode } from '@haku/build'

export interface BrowserProjectDiskFile {
  readonly text: string
  readonly lastModified: number
  readonly size: number
}

export interface BrowserProjectFileSystem {
  listFiles(): Promise<readonly string[]>
  readFile(path: string): Promise<BrowserProjectDiskFile>
  writeFile(path: string, text: string): Promise<BrowserProjectDiskFile>
}

export interface BrowserProjectWorkspaceOptions {
  readonly projectId: string
  readonly trustMode: BrowserProjectTrustMode
  readonly fileSystem: BrowserProjectFileSystem
}

export interface BrowserProjectExternalChange {
  readonly path: string
  readonly status: 'reloaded' | 'conflict'
}

export interface BrowserProjectConflict {
  readonly path: string
  readonly diskText: string
  readonly editorText: string
}

export interface BrowserProjectWatcher {
  dispose(): void
}

interface WorkspaceFile {
  text: string
  baseline: BrowserProjectDiskFile
  dirty: boolean
  conflict?: BrowserProjectConflict
  conflictDisk?: BrowserProjectDiskFile
}

function diskFilesMatch(left: BrowserProjectDiskFile, right: BrowserProjectDiskFile): boolean {
  return (
    left.lastModified === right.lastModified &&
    left.size === right.size &&
    left.text === right.text
  )
}

export class BrowserProjectWorkspace {
  readonly projectId: string
  readonly trustMode: BrowserProjectTrustMode
  private readonly fileSystem: BrowserProjectFileSystem
  private readonly files = new Map<string, WorkspaceFile>()

  private constructor(options: BrowserProjectWorkspaceOptions) {
    this.projectId = options.projectId
    this.trustMode = options.trustMode
    this.fileSystem = options.fileSystem
  }

  static async open(options: BrowserProjectWorkspaceOptions): Promise<BrowserProjectWorkspace> {
    const workspace = new BrowserProjectWorkspace(options)
    const paths = [...(await options.fileSystem.listFiles())].sort()
    for (const path of paths) {
      const file = await options.fileSystem.readFile(path)
      workspace.files.set(path, {
        text: file.text,
        baseline: file,
        dirty: false,
      })
    }
    return workspace
  }

  listFiles(): readonly string[] {
    return [...this.files.keys()].sort()
  }

  readText(path: string): string {
    return this.requireFile(path).text
  }

  async createText(path: string, text: string): Promise<void> {
    this.assertWritable()
    if (this.files.has(path)) throw new Error(`File already exists: ${path}`)
    if ((await this.fileSystem.listFiles()).includes(path)) {
      throw new Error(`File already exists on disk: ${path}`)
    }
    const written = await this.fileSystem.writeFile(path, text)
    this.files.set(path, {
      text,
      baseline: written,
      dirty: false,
    })
  }

  editText(path: string, text: string): void {
    this.assertWritable()
    const file = this.requireFile(path)
    file.text = text
    file.dirty = text !== file.baseline.text
  }

  isDirty(path: string): boolean {
    return this.requireFile(path).dirty
  }

  getConflict(path: string): BrowserProjectConflict | undefined {
    return this.requireFile(path).conflict
  }

  async saveText(
    path: string,
  ): Promise<{ readonly status: 'saved' | 'conflict'; readonly path: string }> {
    this.assertWritable()
    const file = this.requireFile(path)
    const disk = await this.fileSystem.readFile(path)
    if (!diskFilesMatch(disk, file.baseline)) {
      file.conflict = {
        path,
        diskText: disk.text,
        editorText: file.text,
      }
      file.conflictDisk = disk
      return { status: 'conflict', path }
    }

    const written = await this.fileSystem.writeFile(path, file.text)
    file.baseline = written
    file.dirty = false
    file.conflict = undefined
    file.conflictDisk = undefined
    return { status: 'saved', path }
  }

  async pollExternalChanges(): Promise<readonly BrowserProjectExternalChange[]> {
    const changes: BrowserProjectExternalChange[] = []
    for (const path of this.listFiles()) {
      const file = this.requireFile(path)
      const disk = await this.fileSystem.readFile(path)
      if (diskFilesMatch(disk, file.baseline)) continue

      if (file.dirty) {
        file.conflict = {
          path,
          diskText: disk.text,
          editorText: file.text,
        }
        file.conflictDisk = disk
        changes.push({ path, status: 'conflict' })
        continue
      }

      file.text = disk.text
      file.baseline = disk
      file.conflict = undefined
      file.conflictDisk = undefined
      changes.push({ path, status: 'reloaded' })
    }
    return changes
  }

  watchExternalChanges(
    onChanges: (changes: readonly BrowserProjectExternalChange[]) => void,
    intervalMs = 1_000,
  ): BrowserProjectWatcher {
    let polling = false
    const timer = setInterval(() => {
      if (polling) return
      polling = true
      void this.pollExternalChanges()
        .then((changes) => {
          if (changes.length > 0) onChanges(changes)
        })
        .finally(() => {
          polling = false
        })
    }, intervalMs)

    return {
      dispose: () => clearInterval(timer),
    }
  }

  resolveConflict(path: string, resolution: 'reload-disk' | 'keep-editor'): void {
    const file = this.requireFile(path)
    const conflict = file.conflict
    const conflictDisk = file.conflictDisk
    if (!conflict || !conflictDisk) return

    file.baseline = conflictDisk
    if (resolution === 'reload-disk') {
      file.text = conflict.diskText
      file.dirty = false
    } else {
      file.dirty = file.text !== conflict.diskText
    }
    file.conflict = undefined
    file.conflictDisk = undefined
  }

  async forkToDisk(
    projectId: string,
    destination: BrowserProjectFileSystem,
  ): Promise<BrowserProjectWorkspace> {
    for (const path of this.listFiles()) {
      await destination.writeFile(path, this.readText(path))
    }
    return BrowserProjectWorkspace.open({
      projectId,
      trustMode: 'local-trusted',
      fileSystem: destination,
    })
  }

  private assertWritable(): void {
    if (this.trustMode === 'built-in') {
      throw new Error('Built-in projects are read-only. Fork the project to edit it.')
    }
  }

  private requireFile(path: string): WorkspaceFile {
    const file = this.files.get(path)
    if (!file) throw new Error(`File not found: ${path}`)
    return file
  }
}
