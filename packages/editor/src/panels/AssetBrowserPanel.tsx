import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { MeshRendererComponent } from '@haku/core'
import { defaultGeometryParams, normalizeMeshRenderer, relativeToAssetsDir } from '@haku/schema'
import { commitSceneEdit } from '../commands/scene-history.js'
import { primarySelection } from '../selection/selection-utils.js'
import { useEditorStore } from '../store/editor-store.js'
import { projectService } from '../services/project-service.js'
import type { ProjectFileEntry } from '../services/project-service.js'
import {
  buildAssetSearchIndex,
  fileIcon,
  getAssetKind,
  isValidAssetName,
  isValidFolderName,
  matchesAssetFilter,
  parentDirectory,
  type AssetSearchIndex,
} from './asset-browser-utils.js'
import './asset-browser-panel.css'

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

function RefreshIcon() {
  return (
    <ToolbarIcon>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M20 4v4h-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </ToolbarIcon>
  )
}

function CopyIcon() {
  return (
    <ToolbarIcon>
      <rect x="8" y="8" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 16V6a1.5 1.5 0 0 1 1.5-1.5H15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </ToolbarIcon>
  )
}

function TreeToolbarButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="haku-asset-browser__tree-tool"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ActionIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  )
}

function AssignIcon() {
  return (
    <ActionIcon>
      <path d="M12 3v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </ActionIcon>
  )
}

function OpenSceneIcon() {
  return (
    <ActionIcon>
      <path d="M6 4h12v16H6V4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </ActionIcon>
  )
}

function DuplicateIcon() {
  return (
    <ActionIcon>
      <rect x="8" y="8" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 16V6a1.5 1.5 0 0 1 1.5-1.5H15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </ActionIcon>
  )
}

function RenameIcon() {
  return (
    <ActionIcon>
      <path d="M12 20h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </ActionIcon>
  )
}

function RevealIcon() {
  return (
    <ActionIcon>
      <path d="M4 9h6l2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M14 13l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </ActionIcon>
  )
}

function TerminalIcon() {
  return (
    <ActionIcon>
      <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M7 10l3 3-3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 16h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </ActionIcon>
  )
}

function ActionToolButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="haku-asset-browser__tool"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

function isAssetBrowserFocused(): boolean {
  const active = document.activeElement
  return active instanceof HTMLElement && active.closest('[data-haku-asset-browser]') != null
}

const AssetDirectoryTree = memo(function AssetDirectoryTree({
  assetsRoot,
  currentDir,
  searchIndex,
  expandedDirs,
  treeChildren,
  onToggleExpand,
  onNavigate,
}: {
  assetsRoot: string
  currentDir: string
  searchIndex: AssetSearchIndex
  expandedDirs: Set<string>
  treeChildren: Map<string, ProjectFileEntry[]>
  onToggleExpand: (path: string) => void
  onNavigate: (path: string) => void
}) {
  const searchActive = searchIndex.query.length > 0

  const renderNode = (path: string, name: string, depth: number) => {
    if (searchActive && path !== assetsRoot && !searchIndex.dirsVisibleInTree.has(path)) {
      return null
    }

    const isExpanded = expandedDirs.has(path)
    const children = treeChildren.get(path) ?? []
    const childDirs = children.filter(
      (entry) =>
        entry.isDirectory &&
        (!searchActive || searchIndex.dirsVisibleInTree.has(entry.path)),
    )
    const hasChildren = childDirs.length > 0
    const isCurrent = path === currentDir
    const hasMatches = searchActive && searchIndex.dirsWithMatches.has(path)

    return (
      <div key={path}>
        <button
          type="button"
          className={`haku-asset-browser__tree-node${isCurrent ? ' haku-asset-browser__tree-node--current' : ''}${hasMatches ? ' haku-asset-browser__tree-node--match' : ''}`}
          style={{ paddingLeft: 6 + depth * 12 }}
          onClick={() => onNavigate(path)}
        >
          <span
            className={`haku-asset-browser__tree-toggle${hasChildren ? '' : ' haku-asset-browser__tree-toggle--leaf'}`}
            onClick={(event) => {
              if (!hasChildren) return
              event.stopPropagation()
              onToggleExpand(path)
            }}
            aria-hidden="true"
          >
            {hasChildren ? (isExpanded ? '▾' : '▸') : ''}
          </span>
          <span>{fileIcon(name, true)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        </button>
        {isExpanded && childDirs.map((child) => renderNode(child.path, child.name, depth + 1))}
      </div>
    )
  }

  const rootName = assetsRoot.split('/').pop() ?? assetsRoot
  return <div>{renderNode(assetsRoot, rootName, 0)}</div>
})

const AssetQuickActions = memo(function AssetQuickActions({
  selectedEntry,
  selectedPath,
  primary,
  shellActionsAvailable,
  shellActionsEnabled,
  onAssignAsset,
  onOpenScene,
  onDuplicate,
  onRename,
  onReveal,
  onOpenTerminal,
}: {
  selectedEntry: ProjectFileEntry | null
  selectedPath: string | null
  primary: ReturnType<typeof primarySelection>
  shellActionsAvailable: boolean
  shellActionsEnabled: boolean
  onAssignAsset: () => void
  onOpenScene: () => void
  onDuplicate: () => void
  onRename: () => void
  onReveal: () => void
  onOpenTerminal: () => void
}) {
  const shellTooltip = shellActionsEnabled
    ? undefined
    : shellActionsAvailable
      ? 'Available in playground dev mode only'
      : 'Not available for in-memory projects'

  if (!selectedPath || !selectedEntry) {
    return <div className="haku-asset-browser__actions" aria-label="Asset quick actions" />
  }

  if (selectedEntry.isDirectory) {
    return (
      <div className="haku-asset-browser__actions" aria-label="Asset quick actions">
        <ActionToolButton title="Rename folder" onClick={onRename}>
          <RenameIcon />
        </ActionToolButton>
        <ActionToolButton
          title={shellTooltip ?? 'Show folder in Finder or Explorer'}
          disabled={!shellActionsAvailable}
          onClick={onReveal}
        >
          <RevealIcon />
        </ActionToolButton>
        <ActionToolButton
          title={shellTooltip ?? 'Open folder in Terminal'}
          disabled={!shellActionsAvailable}
          onClick={onOpenTerminal}
        >
          <TerminalIcon />
        </ActionToolButton>
      </div>
    )
  }

  const kind = getAssetKind(selectedEntry)

  return (
    <div className="haku-asset-browser__actions" aria-label="Asset quick actions">
      {(kind === 'model' || kind === 'prefab') && (
        <ActionToolButton
          title={primary ? 'Assign model to selected entity' : 'Select an entity in the hierarchy first'}
          disabled={!primary}
          onClick={onAssignAsset}
        >
          <AssignIcon />
        </ActionToolButton>
      )}
      {kind === 'scene' && (
        <ActionToolButton title="Open scene" onClick={onOpenScene}>
          <OpenSceneIcon />
        </ActionToolButton>
      )}
      <ActionToolButton title="Rename" onClick={onRename}>
        <RenameIcon />
      </ActionToolButton>
      <ActionToolButton title="Duplicate (⌘D)" onClick={onDuplicate}>
        <DuplicateIcon />
      </ActionToolButton>
      <ActionToolButton
        title={shellTooltip ?? 'Show in Finder or Explorer'}
        disabled={!shellActionsAvailable}
        onClick={onReveal}
      >
        <RevealIcon />
      </ActionToolButton>
      <ActionToolButton
        title={shellTooltip ?? 'Open containing folder in Terminal'}
        disabled={!shellActionsAvailable}
        onClick={onOpenTerminal}
      >
        <TerminalIcon />
      </ActionToolButton>
    </div>
  )
})

export const AssetBrowserPanel = memo(function AssetBrowserPanel() {
  const projectRoot = useEditorStore((s) => s.projectRoot)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const selection = useEditorStore((s) => s.selection)
  const primary = primarySelection(selection)
  const world = useEditorStore((s) => s.world)
  const setScene = useEditorStore((s) => s.setScene)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const pathInputRef = useRef<HTMLInputElement>(null)

  const assetsRoot = projectService.getAssetsRoot()
  const [currentDir, setCurrentDir] = useState(assetsRoot)
  const [entries, setEntries] = useState<ProjectFileEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderError, setNewFolderError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [pathEditing, setPathEditing] = useState(false)
  const [pathDraft, setPathDraft] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set([assetsRoot]))
  const [treeChildren, setTreeChildren] = useState<Map<string, ProjectFileEntry[]>>(new Map())
  const [allProjectFiles, setAllProjectFiles] = useState<ProjectFileEntry[]>([])
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)

  const shellActionsAvailable = projectService.supportsShellActions()
  const shellActionsEnabled = projectService.canUseShellActions()

  useEffect(() => {
    if (!projectRoot) {
      setEntries([])
      setCurrentDir(assetsRoot)
      setSelectedPath(null)
      setTreeChildren(new Map())
      return
    }
    setCurrentDir(assetsRoot)
    setExpandedDirs(new Set([assetsRoot]))
  }, [projectRoot, assetsRoot])

  const loadDirectory = useCallback(async (dir: string) => {
    const children = await projectService.listDirectory(dir)
    setTreeChildren((prev) => {
      const next = new Map(prev)
      next.set(dir, children)
      return next
    })
    return children
  }, [])

  useEffect(() => {
    if (!projectRoot) return
    setLoading(true)
    void projectService
      .listDirectory(currentDir)
      .then((nextEntries) => {
        setEntries(nextEntries)
        return loadDirectory(currentDir)
      })
      .finally(() => setLoading(false))
  }, [projectRoot, currentDir, sceneDocument, refreshKey, loadDirectory])

  useEffect(() => {
    if (!projectRoot) return
    void loadDirectory(assetsRoot)
  }, [projectRoot, assetsRoot, refreshKey, loadDirectory])

  useEffect(() => {
    if (!projectRoot) {
      setAllProjectFiles([])
      return
    }
    void projectService.listAllAssetFiles().then(setAllProjectFiles)
  }, [projectRoot, refreshKey, sceneDocument])

  const searchIndex = useMemo(
    () => buildAssetSearchIndex(allProjectFiles, searchQuery, assetsRoot),
    [allProjectFiles, searchQuery, assetsRoot],
  )

  useEffect(() => {
    if (!searchIndex.query) return
    setExpandedDirs(new Set(searchIndex.dirsVisibleInTree))
  }, [searchIndex])

  useEffect(() => {
    if (!projectRoot || !searchIndex.query) return
    for (const dir of searchIndex.dirsVisibleInTree) {
      void loadDirectory(dir)
    }
  }, [searchIndex, projectRoot, loadDirectory])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) {
        setAddMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [])

  const navigateTo = useCallback((path: string) => {
    setCurrentDir(path)
    setSelectedPath(null)
    setPathEditing(false)
    void loadDirectory(path)
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      next.add(path)
      let parent = parentDirectory(path, assetsRoot)
      while (parent !== assetsRoot && parent.startsWith(assetsRoot)) {
        next.add(parent)
        parent = parentDirectory(parent, assetsRoot)
      }
      next.add(assetsRoot)
      return next
    })
  }, [assetsRoot, loadDirectory])

  useEffect(() => {
    if (!searchIndex.query || !searchIndex.firstDirWithMatches) return
    if (searchIndex.dirsWithMatches.has(currentDir)) return
    navigateTo(searchIndex.firstDirWithMatches)
  }, [searchIndex, currentDir, navigateTo])

  const goUp = useCallback(() => {
    if (currentDir === assetsRoot) return
    navigateTo(parentDirectory(currentDir, assetsRoot))
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
      setTreeChildren(new Map())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to refresh assets')
    } finally {
      setLoading(false)
    }
  }, [])

  const onToggleExpand = useCallback(
    (path: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
          void loadDirectory(path)
        }
        return next
      })
    },
    [loadDirectory],
  )

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
      setTreeChildren(new Map())
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
      await loadDirectory(currentDir)
    } catch (err) {
      setNewFolderError(err instanceof Error ? err.message : 'Failed to create folder')
    }
  }, [currentDir, newFolderName, loadDirectory])

  const onCancelNewFolder = useCallback(() => {
    setShowNewFolder(false)
    setNewFolderName('')
    setNewFolderError(null)
  }, [])

  const onDuplicateAsset = useCallback(async () => {
    if (!selectedPath) return
    const selectedEntry = entries.find((entry) => entry.path === selectedPath)
    if (!selectedEntry || selectedEntry.isDirectory) return

    try {
      const destPath = await projectService.duplicateAsset(selectedPath)
      setRefreshKey((k) => k + 1)
      setSelectedPath(destPath)
      await loadDirectory(currentDir)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to duplicate asset')
    }
  }, [selectedPath, entries, currentDir, loadDirectory])

  const onStartRename = useCallback(() => {
    const targetPath = selectedPath ?? currentDir
    if (targetPath === assetsRoot) {
      alert('Cannot rename the assets root folder')
      return
    }

    const targetEntry = selectedPath
      ? entries.find((entry) => entry.path === selectedPath)
      : {
          path: currentDir,
          name: currentDir.split('/').pop() ?? currentDir,
          isDirectory: true,
        }
    if (!targetEntry) return

    setRenamingPath(targetPath)
    setRenameDraft(targetEntry.name)
    setRenameError(null)
  }, [selectedPath, currentDir, assetsRoot, entries])

  const onCancelRename = useCallback(() => {
    setRenamingPath(null)
    setRenameDraft('')
    setRenameError(null)
  }, [])

  const onCommitRename = useCallback(async () => {
    if (!renamingPath) return
    const selectedEntry =
      entries.find((entry) => entry.path === renamingPath) ??
      ({
        path: renamingPath,
        name: renamingPath.split('/').pop() ?? renamingPath,
        isDirectory: true,
      } as ProjectFileEntry)

    const error = isValidAssetName(renameDraft, selectedEntry.isDirectory)
    if (error) {
      setRenameError(error)
      return
    }

    const nextName = renameDraft.trim()
    if (nextName === selectedEntry.name) {
      onCancelRename()
      return
    }

    try {
      const destPath = await projectService.renameAsset(renamingPath, nextName)
      setRefreshKey((k) => k + 1)
      setRenamingPath(null)
      setRenameDraft('')
      setRenameError(null)
      setSelectedPath(selectedEntry.isDirectory ? null : destPath)
      if (selectedEntry.isDirectory) {
        navigateTo(destPath)
      } else {
        await loadDirectory(currentDir)
      }
      setTreeChildren(new Map())
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Failed to rename asset')
    }
  }, [renamingPath, renameDraft, entries, currentDir, loadDirectory, navigateTo, onCancelRename])

  const onReveal = useCallback(async () => {
    const targetPath = selectedPath ?? currentDir
    if (!shellActionsEnabled) {
      try {
        await navigator.clipboard.writeText(targetPath)
        setCopyFeedback('Path copied — shell actions need playground dev mode')
        window.setTimeout(() => setCopyFeedback(null), 2500)
      } catch {
        alert('Show in Finder is not available for this project type')
      }
      return
    }

    try {
      await projectService.revealInFileManager(targetPath)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reveal in file manager')
    }
  }, [selectedPath, currentDir, shellActionsEnabled])

  const onOpenTerminal = useCallback(async () => {
    const targetDir = selectedPath
      ? selectedPath.includes('/')
        ? selectedPath.slice(0, selectedPath.lastIndexOf('/'))
        : assetsRoot
      : currentDir

    if (!shellActionsEnabled) {
      try {
        await navigator.clipboard.writeText(targetDir)
        setCopyFeedback('Path copied — shell actions need playground dev mode')
        window.setTimeout(() => setCopyFeedback(null), 2500)
      } catch {
        alert('Open in Terminal is not available for this project type')
      }
      return
    }

    try {
      await projectService.openInTerminal(targetDir)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open terminal')
    }
  }, [selectedPath, currentDir, assetsRoot, shellActionsEnabled])

  const displayPath = selectedPath ?? currentDir

  const onCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayPath)
      setCopyFeedback('Path copied')
      window.setTimeout(() => setCopyFeedback(null), 1500)
    } catch {
      alert('Could not copy path to clipboard')
    }
  }, [displayPath])

  const commitPathEdit = useCallback(() => {
    const next = pathDraft.trim().replace(/^\/+/, '')
    if (!next) {
      setPathEditing(false)
      return
    }
    if (next !== assetsRoot && !next.startsWith(`${assetsRoot}/`)) {
      alert(`Path must stay under ${assetsRoot}/`)
      setPathEditing(false)
      return
    }
    navigateTo(next)
  }, [pathDraft, assetsRoot, navigateTo])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isAssetBrowserFocused()) return
      if (useEditorStore.getState().mode === 'play') return
      if (event.repeat) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.code !== 'KeyD') return
      if (isEditableTarget(event.target)) return

      const selectedEntry = entries.find((entry) => entry.path === selectedPath)
      if (!selectedPath || !selectedEntry || selectedEntry.isDirectory) return

      event.preventDefault()
      event.stopPropagation()
      void onDuplicateAsset()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [selectedPath, entries, onDuplicateAsset])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) return entries
    return entries.filter((entry) => !entry.isDirectory && matchesAssetFilter(entry, query))
  }, [entries, searchQuery])

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.path === selectedPath) ?? null,
    [entries, selectedPath],
  )

  const actionTarget = useMemo((): ProjectFileEntry | null => {
    if (selectedEntry) return selectedEntry
    if (!projectRoot) return null
    return {
      path: currentDir,
      name: currentDir.split('/').pop() ?? currentDir,
      isDirectory: true,
    }
  }, [selectedEntry, projectRoot, currentDir])

  if (!projectRoot) {
    return <div className="haku-asset-browser--empty">Open a project to browse assets</div>
  }

  return (
    <div
      className="haku-asset-browser"
      data-haku-asset-browser=""
      tabIndex={-1}
      onFocusCapture={() => undefined}
    >
      <div className="haku-asset-browser__search-row">
        <input
          type="search"
          className="haku-asset-browser__search"
          placeholder="Search assets in project…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.json"
        style={{ display: 'none' }}
        onChange={(event) => {
          void onImport(event.target.files)
          event.target.value = ''
        }}
      />

      <PanelGroup direction="horizontal" autoSaveId="haku-asset-browser-cols" className="haku-asset-browser__body">
        <Panel defaultSize={28} minSize={15} maxSize={55} className="haku-asset-browser__panel">
          <div className="haku-asset-browser__tree-column">
            <div className="haku-asset-browser__tree-toolbar">
              <div className="haku-asset-browser__add-menu" ref={addMenuRef}>
                <TreeToolbarButton title="Create or import" onClick={() => setAddMenuOpen((open) => !open)}>
                  <span className="haku-asset-browser__tree-tool-plus" aria-hidden="true">
                    +
                  </span>
                </TreeToolbarButton>
                {addMenuOpen && (
                  <div className="haku-asset-browser__dropdown" role="menu">
                    <button
                      type="button"
                      className="haku-asset-browser__dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false)
                        setShowNewFolder(true)
                      }}
                    >
                      New Folder
                    </button>
                    <button
                      type="button"
                      className="haku-asset-browser__dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false)
                        fileInputRef.current?.click()
                      }}
                    >
                      Import
                    </button>
                  </div>
                )}
              </div>
              <TreeToolbarButton
                title="Up to parent folder"
                disabled={currentDir === assetsRoot}
                onClick={goUp}
              >
                <FolderUpIcon />
              </TreeToolbarButton>
              <TreeToolbarButton title="Refresh" onClick={() => void onRefreshAssets()}>
                <RefreshIcon />
              </TreeToolbarButton>
            </div>

            {showNewFolder && (
              <div className="haku-asset-browser__new-folder">
                <label className="haku-asset-browser__new-folder-label" htmlFor="asset-new-folder-name">
                  Folder name
                </label>
                <input
                  id="asset-new-folder-name"
                  type="text"
                  className="haku-asset-browser__new-folder-input"
                  value={newFolderName}
                  autoFocus
                  onChange={(event) => {
                    setNewFolderName(event.target.value)
                    setNewFolderError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void onCreateFolder()
                    if (event.key === 'Escape') onCancelNewFolder()
                  }}
                />
                <button type="button" className="haku-asset-browser__toolbar-btn" onClick={() => void onCreateFolder()}>
                  Create
                </button>
                <button type="button" className="haku-asset-browser__toolbar-btn" onClick={onCancelNewFolder}>
                  Cancel
                </button>
                {newFolderError && <span className="haku-asset-browser__error">{newFolderError}</span>}
              </div>
            )}

            <div className="haku-asset-browser__tree">
              <AssetDirectoryTree
                assetsRoot={assetsRoot}
                currentDir={currentDir}
                searchIndex={searchIndex}
                expandedDirs={expandedDirs}
                treeChildren={treeChildren}
                onToggleExpand={onToggleExpand}
                onNavigate={navigateTo}
              />
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="haku-resize-handle haku-resize-handle--horizontal" />

        <Panel defaultSize={6} minSize={6} maxSize={6} className="haku-asset-browser__panel haku-asset-browser__panel--actions">
          <AssetQuickActions
            selectedEntry={actionTarget}
            selectedPath={selectedPath ?? currentDir}
            primary={primary}
            shellActionsAvailable={shellActionsAvailable}
            shellActionsEnabled={shellActionsEnabled}
            onAssignAsset={onAssignAsset}
            onOpenScene={() => void onOpenScene()}
            onDuplicate={() => void onDuplicateAsset()}
            onRename={onStartRename}
            onReveal={() => void onReveal()}
            onOpenTerminal={() => void onOpenTerminal()}
          />
        </Panel>

        <PanelResizeHandle className="haku-resize-handle haku-resize-handle--horizontal" />

        <Panel minSize={25} className="haku-asset-browser__panel">
          <div className="haku-asset-browser__files-column">
            {renamingPath && (
              <div className="haku-asset-browser__rename-bar">
                <label className="haku-asset-browser__new-folder-label" htmlFor="asset-rename-input">
                  Rename
                </label>
                <input
                  id="asset-rename-input"
                  type="text"
                  className="haku-asset-browser__new-folder-input"
                  value={renameDraft}
                  autoFocus
                  onChange={(event) => {
                    setRenameDraft(event.target.value)
                    setRenameError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void onCommitRename()
                    if (event.key === 'Escape') onCancelRename()
                  }}
                />
                <button type="button" className="haku-asset-browser__toolbar-btn" onClick={() => void onCommitRename()}>
                  Save
                </button>
                <button type="button" className="haku-asset-browser__toolbar-btn" onClick={onCancelRename}>
                  Cancel
                </button>
                {renameError && <span className="haku-asset-browser__error">{renameError}</span>}
              </div>
            )}

            <div className="haku-asset-browser__files">
              {loading ? (
                <div className="haku-asset-browser__loading">Loading…</div>
              ) : filteredEntries.length === 0 ? (
                <div className="haku-asset-browser__empty-folder">
                  {searchQuery.trim()
                    ? searchIndex.dirsWithMatches.has(currentDir)
                      ? `No files match “${searchQuery.trim()}” in this folder`
                      : `No matches in this folder — select a highlighted folder in the tree`
                    : `Empty folder — use + → Import, New Folder, or add files under ${currentDir}/`}
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const selected = selectedPath === entry.path
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      className={`haku-asset-browser__file-row${selected ? ' haku-asset-browser__file-row--selected' : ''}`}
                      onClick={() => setSelectedPath(entry.path)}
                      onDoubleClick={() => onEntryActivate(entry)}
                    >
                      <span>{fileIcon(entry.name, entry.isDirectory)}</span>
                      <span className="haku-asset-browser__file-name">{entry.name}</span>
                    </button>
                  )
                })
              )}
            </div>

            <div className="haku-asset-browser__files-footer">
              {copyFeedback && <div className="haku-asset-browser__copy-feedback">{copyFeedback}</div>}
              <div className="haku-asset-browser__path-row">
                {pathEditing ? (
                  <input
                    ref={pathInputRef}
                    type="text"
                    className="haku-asset-browser__path"
                    value={pathDraft}
                    autoFocus
                    onChange={(event) => setPathDraft(event.target.value)}
                    onBlur={commitPathEdit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitPathEdit()
                      if (event.key === 'Escape') setPathEditing(false)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="haku-asset-browser__path"
                    title="Click to edit path"
                    onClick={() => {
                      setPathDraft(displayPath)
                      setPathEditing(true)
                    }}
                  >
                    {displayPath}
                  </button>
                )}
                <button
                  type="button"
                  className="haku-asset-browser__path-copy"
                  title="Copy path"
                  aria-label="Copy path"
                  onClick={() => void onCopyPath()}
                >
                  <CopyIcon />
                </button>
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
})
