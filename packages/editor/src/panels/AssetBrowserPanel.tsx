import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/editor-store.js'
import { projectService, assignPrototype, assignMeshPrototype } from '../services/project-service.js'
import type { ProjectFileEntry } from '../services/project-service.js'

function fileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return '📁'
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'glb' || ext === 'gltf') return '🎲'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return '🖼'
  if (name.endsWith('.scene.json') || ext === 'json') return '📋'
  return '📄'
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
  const scenePath = useEditorStore((s) => s.scenePath)
  const selection = useEditorStore((s) => s.selection)
  const world = useEditorStore((s) => s.world)
  const setScene = useEditorStore((s) => s.setScene)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const assetsRoot = projectService.getAssetsRoot()
  const [currentDir, setCurrentDir] = useState(assetsRoot)
  const [entries, setEntries] = useState<ProjectFileEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(false)

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
      setScene(selectedPath, document, nextWorld as import('@haku/core').World)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open scene')
    }
  }, [selectedPath, setScene])

  const onAssignAsset = useCallback(() => {
    if (!selectedPath || !selection || !world || !sceneDocument || !scenePath) return
    const ext = selectedPath.split('.').pop()?.toLowerCase()
    if (ext !== 'glb' && ext !== 'gltf') {
      alert('Select a GLTF/GLB model to assign as mesh prototype.')
      return
    }
    const prototypeId = selectedPath.split('/').pop()?.replace(/\.(glb|gltf)$/i, '') ?? 'model'
    const nextDoc = assignPrototype(sceneDocument, prototypeId, selectedPath)
    assignMeshPrototype(world, selection, prototypeId)
    setScene(scenePath, nextDoc, world)
  }, [selectedPath, selection, world, sceneDocument, scenePath, setScene])

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return

    for (const file of files) {
      const dest = `${currentDir}/${file.name}`
      projectService.importVirtualAsset(dest, file)
    }

    setRefreshKey((k) => k + 1)
  }

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
            <button type="button" onClick={goUp} disabled={currentDir === assetsRoot} title="Up">
              ↑
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Import
            </button>
          </div>
        </div>
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
            Empty folder — use Import or add files under <code>{currentDir}/</code>
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
            {(selectedPath.endsWith('.glb') || selectedPath.endsWith('.gltf')) && selection && (
              <button type="button" onClick={onAssignAsset} disabled={!selection}>
                Assign to Entity
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
