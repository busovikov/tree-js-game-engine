import type { DirectoryEntry } from './browser-project-store.js'

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/, '')
}

function splitPath(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean)
}

class NativeProjectStore {
  private rootHandle: FileSystemDirectoryHandle | null = null
  private rootName = ''

  getRootName(): string {
    return this.rootName
  }

  hasRoot(): boolean {
    return this.rootHandle !== null
  }

  async openDirectoryPicker(): Promise<string> {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    return this.useRootHandle(handle)
  }

  useRootHandle(handle: FileSystemDirectoryHandle): string {
    this.rootHandle = handle
    this.rootName = handle.name
    return this.rootName
  }

  async pickProjectDirectory(): Promise<FileSystemDirectoryHandle> {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    for await (const _entry of handle.entries()) {
      void _entry
      throw new Error('Selected folder is not empty. Choose an empty directory for a new project.')
    }
    return handle
  }

  async scaffoldProject(rootHandle: FileSystemDirectoryHandle, files: Map<string, string>): Promise<void> {
    this.rootHandle = rootHandle
    this.rootName = rootHandle.name

    for (const [path, content] of files) {
      await this.writeText(path, content)
    }
  }

  async ensureWritePermission(): Promise<void> {
    if (!this.rootHandle) throw new Error('No project folder open')
    const permission = await this.rootHandle.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') {
      throw new Error('Write permission to the project folder was denied')
    }
  }

  async readText(path: string): Promise<string> {
    const fileHandle = await this.getFileHandle(path)
    const file = await fileHandle.getFile()
    return file.text()
  }

  async writeText(path: string, content: string): Promise<void> {
    await this.ensureWritePermission()
    const fileHandle = await this.getOrCreateFileHandle(path, true)
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async writeFile(path: string, file: File | Blob): Promise<void> {
    await this.ensureWritePermission()
    const fileHandle = await this.getOrCreateFileHandle(path, true)
    const writable = await fileHandle.createWritable()
    await writable.write(file)
    await writable.close()
  }

  async listDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    try {
      return await this.listDirectoryAt(dirPath)
    } catch {
      if (dirPath === 'assets' || dirPath.startsWith('assets/')) {
        const publicPath = dirPath.replace(/^assets\b/, 'public/assets')
        const entries = await this.listDirectoryAt(publicPath)
        return entries.map((entry) => ({
          ...entry,
          path: entry.path.replace(/^public\/assets\b/, 'assets'),
        }))
      }
      throw new Error(`Directory not found: ${dirPath}`)
    }
  }

  private async listDirectoryAt(dirPath: string): Promise<DirectoryEntry[]> {
    const dirHandle = await this.getDirectoryHandle(dirPath)
    const folders: DirectoryEntry[] = []
    const files: DirectoryEntry[] = []

    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.')) continue
      const path = normalizePath(`${dirPath}/${name}`)
      if (handle.kind === 'directory') {
        folders.push({ path, name, isDirectory: true })
      } else {
        files.push({ path, name, isDirectory: false })
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))
    return [...folders, ...files]
  }

  private async getDirectoryHandle(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    if (!this.rootHandle) throw new Error('No project folder open')

    const parts = splitPath(path)
    let current = this.rootHandle

    for (const part of parts) {
      current = await current.getDirectoryHandle(part, create ? { create: true } : undefined)
    }

    return current
  }

  private async getFileHandle(path: string): Promise<FileSystemFileHandle> {
    const normalized = normalizePath(path)
    const alias = normalized.startsWith('public/assets/')
      ? normalized.replace('public/assets/', 'assets/')
      : normalized

    try {
      return await this.getFileHandleAtPath(alias)
    } catch {
      if (alias !== normalized) {
        return this.getFileHandleAtPath(normalized)
      }
      throw new Error(`File not found: ${path}`)
    }
  }

  private async getOrCreateFileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const parts = splitPath(path)
    if (parts.length === 0) throw new Error(`Invalid file path: ${path}`)

    const fileName = parts.pop()!
    const dirHandle =
      parts.length > 0 ? await this.getDirectoryHandle(parts.join('/'), create) : this.rootHandle!
    return dirHandle.getFileHandle(fileName, { create })
  }

  private async getFileHandleAtPath(path: string): Promise<FileSystemFileHandle> {
    const parts = splitPath(path)
    if (parts.length === 0) throw new Error(`Invalid file path: ${path}`)

    const fileName = parts.pop()!
    const dirHandle = parts.length > 0 ? await this.getDirectoryHandle(parts.join('/')) : this.rootHandle!
    return dirHandle.getFileHandle(fileName)
  }

  clear(): void {
    this.rootHandle = null
    this.rootName = ''
  }
}

export const nativeProjectStore = new NativeProjectStore()
