/** In-memory project files loaded from folder picker (browser). */
export interface VirtualFile {
  path: string
  content?: string
  file?: File
  isBinary?: boolean
}

export interface DirectoryEntry {
  path: string
  name: string
  isDirectory: boolean
}

class BrowserProjectStore {
  private files = new Map<string, VirtualFile>()
  private rootName = ''

  loadFromFileList(fileList: FileList): string {
    this.files.clear()
    if (fileList.length === 0) throw new Error('No files selected')

    const first = fileList[0]
    this.rootName = first.webkitRelativePath.split('/')[0] ?? 'project'

    for (const file of fileList) {
      const path = file.webkitRelativePath.replace(`${this.rootName}/`, '')
      if (!path || path.startsWith('.')) continue
      const entry = { file, isBinary: isBinaryPath(path) }
      this.registerFile(path, entry)
    }

    return this.rootName
  }

  registerFile(path: string, entry: Omit<VirtualFile, 'path'>): void {
    const normalized = normalizePath(path)
    this.files.set(normalized, { path: normalized, ...entry })
  }

  async registerFromUrl(path: string, url: string): Promise<void> {
    const normalized = normalizePath(path)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch ${url}`)
    const isBinary = isBinaryPath(path)
    if (isBinary) {
      const blob = await res.blob()
      const file = new File([blob], normalized.split('/').pop() ?? 'file', { type: blob.type })
      this.registerFile(normalized, { file, isBinary: true })
    } else {
      const content = await res.text()
      this.registerFile(normalized, { content })
    }
  }

  async readText(path: string): Promise<string> {
    const entry = this.files.get(normalizePath(path))
    if (!entry) throw new Error(`File not found: ${path}`)
    if (entry.content) return entry.content
    if (!entry.file) throw new Error(`File not readable: ${path}`)
    if (entry.isBinary) throw new Error(`Binary file cannot be read as text: ${path}`)
    entry.content = await entry.file.text()
    return entry.content
  }

  writeText(path: string, content: string): void {
    const normalized = normalizePath(path)
    const existing = this.files.get(normalized)
    this.files.set(normalized, { path: normalized, content, file: existing?.file, isBinary: false })
  }

  /** Immediate children of a directory (folders first, then files). */
  listDirectory(dirPath: string): DirectoryEntry[] {
    const dir = normalizePath(dirPath)
    const prefix = dir ? `${dir}/` : ''
    const folders = new Map<string, string>()
    const files: DirectoryEntry[] = []

    for (const path of this.files.keys()) {
      if (dir && !path.startsWith(prefix)) continue
      if (!dir && path.includes('/')) {
        const top = path.split('/')[0]
        if (top) folders.set(top, top)
        continue
      }

      const rest = dir ? path.slice(prefix.length) : path
      if (!rest) continue

      const slash = rest.indexOf('/')
      if (slash === -1) {
        files.push({ path, name: rest, isDirectory: false })
      } else {
        const folderName = rest.slice(0, slash)
        const folderPath = dir ? `${dir}/${folderName}` : folderName
        folders.set(folderName, folderPath)
      }
    }

    const folderEntries: DirectoryEntry[] = [...folders.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, path]) => ({ path, name, isDirectory: true }))

    files.sort((a, b) => a.name.localeCompare(b.name))
    return [...folderEntries, ...files]
  }

  getRootName(): string {
    return this.rootName
  }

  has(path: string): boolean {
    return this.files.has(normalizePath(path))
  }

  getFile(path: string): VirtualFile | undefined {
    return this.files.get(normalizePath(path))
  }

  clear(): void {
    this.files.clear()
    this.rootName = ''
  }

  removeUnderPrefix(prefix: string): void {
    const normalized = normalizePath(prefix)
    const withSlash = `${normalized}/`
    for (const path of [...this.files.keys()]) {
      if (path === normalized || path.startsWith(withSlash)) {
        this.files.delete(path)
      }
    }
  }
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '')
}

function isBinaryPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext === 'glb' || ext === 'gltf' || ext === 'bin' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp'
}

export const browserProjectStore = new BrowserProjectStore()
