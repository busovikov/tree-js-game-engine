import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MeshRendererComponent } from '@haku/core'
import { defaultGeometryParams, normalizeMeshRenderer, relativeToAssetsDir } from '@haku/schema'
import { commitSceneEdit } from '../commands/scene-history.js'
import { primarySelection } from '../selection/selection-utils.js'
import { useEditorStore } from '../store/editor-store.js'
import { projectService } from '../services/project-service.js'
import type { ProjectFileEntry } from '../services/project-service.js'

function fileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return '📁'
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'glb' || ext === 'gltf') return '🎲'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return '🖼'
  if (name.endsWith('.scene.json') || ext === 'json') return '📋'
  return '📄'
}

function ToolbarIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  )
}

function FolderUpIcon() {
  return (
    <ToolbarIcon>
      <path
        d="M4 9h6l2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M12 6V3M9 6l3-3 3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </ToolbarIcon>
  )
}

const toolbarButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '3px 8px',
  border: '1px solid #444',
  borderRadius: 4,
  background: '#2a2a35',
  color: '#eee',
  cursor: 'pointer',
  fontSize: 11,
}

function isValidFolderName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Folder name is required'
  if (trimmed.includes('/') || trimmed.includes('\\')) return 'Folder name cannot contain slashes'
  if (trimmed === '.' || trimmed === '..') return 'Invalid folder name'
  return null
}

function Breadcrumbs({
  path,
  assetsRoot,
  onNavigate,
}: {
  path: string
  assetsRoot: string
  onNavigate: (path: string) => void
}) {
  const parts = path.startsWith(assetsRoot) ? path.slice(assetsRoot.length).split('/').filter(Boolean) : []
  const crumbs: Array<{ label: string; path: string }> = [{ label: assetsRoot, path: assetsRoot }]
  let acc = assetsRoot
  for (const part of parts) {
    acc = `${acc}/${part}`
    crumbs.push({ label: part, path: acc })
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 11, color: '#aaa', marginBottom: 8 }}>
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span style={{ color: '#555' }}>/</span>}
          <button
            type="button"
            onClick={() => onNavigate(crumb.path)}
            style={{
              background: 'none',
              border: 'none',
              color: i === crumbs.length - 1 ? '#eee' : '#8ab4ff',
              cursor: 'pointer',
              padding: 0,
              fontSize: 11,
            }}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </div>
  )
}

export const AssetBrowserPanel = memo(function AssetBrowserPanel() {
  const projectRoot = useEditorStore((s) => s.projectRoot)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const selection = useEditorStore((s) => s.selection)
  const primary = primarySelection(selection)
  const world = useEditorStore((s) => s.world)
  const setScene = useEditorStore((s) => s.setScene)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const assetsRoot = projectService.getAssetsRoot()
  const [currentDir, setCurrentDir] = useState(assetsRoot)
  const [entries, setEntries] = useState<ProjectFileEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderError, setNewFolderError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectRoot) {
      setEntries([])
      setCurrentDir(assetsRoot)
      setSelectedPath(null)
      return
    }
    setCurrentDir(assetsRoot)
  }, [projectRoot, assetsRoot])

  useEffect(() => {
    if (!projectRoot) return
    setLoading(true)
    void projectService
      .listDirectory(currentDir)
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [projectRoot, currentDir, sceneDocument, refreshKey])

  const navigateTo = useCallback((path: string) => {
    setCurrentDir(path)
    setSelectedPath(null)
  }, [])

  const goUp = useCallback(() => {
    if (currentDir === assetsRoot) return
    const parent = currentDir.includes('/') ? currentDir.slice(0, currentDir.lastIndexOf('/')) : assetsRoot
    navigateTo(parent || assetsRoot)
  }, [currentDir, assetsRoot, navigateTo])

  const onRefreshAssets = useCallback(async () => {
    if (projectService.usesNativeFileSystem()) {
      setRefreshKey((k) => k + 1)
      return
    }

    if (!projectService.isVirtualFs()) {
      setRefreshKey((k) => k + 1)
      return
    }
    setLoading(true)
    try {
      await projectService.resyncVirtualAssetsFromManifest()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to refresh assets')
    } finally {
      setLoading(false)
    }
  }, [])

  const onEntryActivate = useCallback(
    (entry: ProjectFileEntry) => {
      if (entry.isDirectory) {
        navigateTo(entry.path)
        return
      }
      setSelectedPath(entry.path)
    },
    [navigateTo],
  )

  const onOpenScene = useCallback(async () => {
    if (!selectedPath || !selectedPath.endsWith('.scene.json')) return
    try {
      const { world: nextWorld, document } = await projectService.loadScene(selectedPath)
      setScene(
        selectedPath,
        document,
        nextWorld as import('@haku/core').World,
        projectService.getSceneEditorState(selectedPath).activeTab,
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open scene')
    }
  }, [selectedPath, setScene])

  const onAssignAsset = useCallback(() => {
    if (!selectedPath) {
      alert('Select a GLB or GLTF model in the asset browser.')
      return
    }
    if (!primary || !world) {
      alert('Select an entity in the scene hierarchy to assign the model.')
      return
    }
    const ext = selectedPath.split('.').pop()?.toLowerCase()
    if (ext !== 'glb' && ext !== 'gltf') {
      alert('Only GLB and GLTF models can be assigned to entities.')
      return
    }
    const modelAsset = relativeToAssetsDir(selectedPath, projectService.getAssetsRoot())
    if (!modelAsset) {
      alert(`Asset is outside the project assets directory (${projectService.getAssetsRoot()}).`)
      return
    }

    commitSceneEdit((draft) => {
      const entityId = primary
      if (!draft.world.hasComponent(entityId, MeshRendererComponent)) {
        const meshDefaults = MeshRendererComponent.defaults!()
        draft.world.addComponent(entityId, MeshRendererComponent, {
          ...meshDefaults,
          geometryType: 'ModelGeometry',
          geometryParams: defaultGeometryParams('ModelGeometry'),
          modelAsset,
        })
        return
      }
      const current = normalizeMeshRenderer(draft.world.getComponent(entityId, MeshRendererComponent))
      draft.world.addComponent(entityId, MeshRendererComponent, {
        ...current,
        geometryType: 'ModelGeometry',
        geometryParams: defaultGeometryParams('ModelGeometry'),
        modelAsset,
      })
    })
  }, [selectedPath, primary, world])

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return

    try {
      for (const file of files) {
        const dest = `${currentDir}/${file.name}`
        await projectService.importAsset(dest, file)
      }
      setRefreshKey((k) => k + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import asset')
    }
  }

  const onCreateFolder = useCallback(async () => {
    const error = isValidFolderName(newFolderName)
    if (error) {
      setNewFolderError(error)
      return
    }

    const folderName = newFolderName.trim()
    const dest = `${currentDir}/${folderName}`

    try {
      await projectService.createDirectory(dest)
      setShowNewFolder(false)
      setNewFolderName('')
      setNewFolderError(null)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setNewFolderError(err instanceof Error ? err.message : 'Failed to create folder')
    }
  }, [currentDir, newFolderName])

  const onCancelNewFolder = useCallback(() => {
    setShowNewFolder(false)
    setNewFolderName('')
    setNewFolderError(null)
  }, [])

  if (!projectRoot) {
    return (
      <div style={{ padding: 12, color: '#888', background: '#252530', height: '100%' }}>
        Open a project to browse assets
      </div>
    )
  }

  const selectedEntry = entries.find((e) => e.path === selectedPath)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#252530',
        color: '#eee',
      }}
    >
      <div style={{ padding: '8px 8px 0', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 13 }}>Assets</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={goUp}
              disabled={currentDir === assetsRoot}
              title="Up to parent folder"
              aria-label="Up to parent folder"
              style={{
                ...toolbarButtonStyle,
                padding: '3px 6px',
                opacity: currentDir === assetsRoot ? 0.4 : 1,
                cursor: currentDir === assetsRoot ? 'default' : 'pointer',
              }}
            >
              <FolderUpIcon />
            </button>
            <button type="button" onClick={() => void onRefreshAssets()} title="Refresh" style={toolbarButtonStyle}>
              ↻
            </button>
            <button type="button" onClick={() => setShowNewFolder(true)} style={toolbarButtonStyle}>
              New Folder
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} style={toolbarButtonStyle}>
              Import
            </button>
          </div>
        </div>
        {showNewFolder && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
              padding: 8,
              background: '#1e1e28',
              borderRadius: 4,
              border: '1px solid #444',
            }}
          >
            <label style={{ fontSize: 11, color: '#aaa' }} htmlFor="asset-new-folder-name">
              Folder name
            </label>
            <input
              id="asset-new-folder-name"
              type="text"
              value={newFolderName}
              autoFocus
              onChange={(e) => {
                setNewFolderName(e.target.value)
                setNewFolderError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onCreateFolder()
                if (e.key === 'Escape') onCancelNewFolder()
              }}
              style={{
                flex: 1,
                minWidth: 120,
                padding: '4px 6px',
                border: '1px solid #555',
                borderRadius: 4,
                background: '#252530',
                color: '#eee',
                fontSize: 12,
              }}
            />
            <button type="button" onClick={() => void onCreateFolder()} style={toolbarButtonStyle}>
              Create
            </button>
            <button type="button" onClick={onCancelNewFolder} style={toolbarButtonStyle}>
              Cancel
            </button>
            {newFolderError && (
              <span style={{ width: '100%', fontSize: 11, color: '#f88' }}>{newFolderError}</span>
            )}
          </div>
        )}
        <Breadcrumbs path={currentDir} assetsRoot={assetsRoot} onNavigate={navigateTo} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          void onImport(e.target.files)
          e.target.value = ''
        }}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ padding: 12, color: '#888', fontSize: 12 }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 12, color: '#888', fontSize: 12 }}>
            Empty folder — use Import, New Folder, or add files under <code>{currentDir}/</code>
          </div>
        ) : (
          entries.map((entry) => {
            const selected = selectedPath === entry.path
            return (
              <button
                key={entry.path}
                type="button"
                onClick={() => setSelectedPath(entry.path)}
                onDoubleClick={() => onEntryActivate(entry)}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 10px',
                  border: 'none',
                  background: selected ? '#3d5afe33' : 'transparent',
                  color: '#eee',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                }}
              >
                <span>{fileIcon(entry.name, entry.isDirectory)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.name}
                </span>
                {entry.isDirectory && <span style={{ color: '#666', fontSize: 10 }}>↵</span>}
              </button>
            )
          })
        )}
      </div>

      {selectedPath && selectedEntry && !selectedEntry.isDirectory && (
        <div style={{ padding: 8, borderTop: '1px solid #333', fontSize: 11, color: '#aaa' }}>
          <div style={{ wordBreak: 'break-all', marginBottom: 8 }}>{selectedPath}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {selectedPath.endsWith('.scene.json') && (
              <button type="button" onClick={() => void onOpenScene()}>
                Open Scene
              </button>
            )}
            {(selectedPath.endsWith('.glb') || selectedPath.endsWith('.gltf')) && primary && (
              <button type="button" onClick={onAssignAsset} disabled={!primary}>
                Assign to Entity
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
