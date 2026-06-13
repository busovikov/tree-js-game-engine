import { memo, useCallback, useMemo } from 'react'
import { EditorLayout } from './EditorLayout.js'
import { MenuBar } from './components/MenuBar.js'
import { useEditorStore } from './store/editor-store.js'
import { projectService } from './services/project-service.js'
import { globalCommandBus } from './commands/command-bus.js'
import {
  CreatePrefabCommand,
  PlacePrefabCommand,
  executeCommand,
} from './commands/world-commands.js'

function pickProjectFolder(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    ;(input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true
    input.onchange = () => resolve(input.files)
    input.click()
  })
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export const EditorApp = memo(function EditorApp() {
  const mode = useEditorStore((s) => s.mode)
  const scenePath = useEditorStore((s) => s.scenePath)
  const selection = useEditorStore((s) => s.selection)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const commandRevision = useEditorStore((s) => s.commandRevision)
  const enterPlayMode = useEditorStore((s) => s.enterPlayMode)
  const exitPlayMode = useEditorStore((s) => s.exitPlayMode)

  const onOpenProject = useCallback(async () => {
    try {
      if (projectService.isFileSystemAccessSupported()) {
        await projectService.openFromDirectoryPicker()
        return
      }

      const files = await pickProjectFolder()
      if (!files?.length) return
      await projectService.openFromFileList(files)
    } catch (err) {
      if (isAbortError(err)) return
      alert(err instanceof Error ? err.message : 'Failed to open project')
    }
  }, [])

  const onCreateProject = useCallback(async () => {
    const defaultName = 'my-game'
    const projectName = prompt('Project name', defaultName)?.trim()
    if (!projectName) return

    try {
      await projectService.createNewProject(projectName)
    } catch (err) {
      if (isAbortError(err)) return
      alert(err instanceof Error ? err.message : 'Failed to create project')
    }
  }, [])

  const onLoadPlayground = useCallback(async () => {
    try {
      projectService.openFromManifest(
        'playground',
        {
          name: 'playground',
          entryScene: 'assets/scenes/menu.scene.json',
          assetsDir: 'assets',
          scriptsDir: 'scripts',
        },
        '',
      )
      await projectService.seedVirtualAssetsFromManifest('/assets/manifest.json')
      const { world, document } = await projectService.loadScene('assets/scenes/menu.scene.json')
      useEditorStore.getState().setProjectRoot('playground')
      useEditorStore.getState().setScene('assets/scenes/menu.scene.json', document, world as import('@haku/core').World)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load demo scene')
    }
  }, [])

  const onSave = useCallback(async () => {
    const { world, sceneDocument, scenePath } = useEditorStore.getState()
    if (!world || !sceneDocument || !scenePath) return

    try {
      await projectService.saveScene(scenePath, world, sceneDocument)

      if (projectService.usesNativeFileSystem()) return

      const saved = useEditorStore.getState().sceneDocument
      if (!saved) return
      const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = scenePath.split('/').pop() ?? 'scene.scene.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save scene')
    }
  }, [])

  const onCreatePrefab = useCallback(() => {
    if (!selection) return
    const prefabId = prompt('Prefab id', `${useEditorStore.getState().world?.getEntityName(selection) ?? 'prefab'}`.toLowerCase())
    if (!prefabId) return
    executeCommand(new CreatePrefabCommand(selection, prefabId))
  }, [selection])

  const onPlacePrefab = useCallback(() => {
    const ids = Object.keys(sceneDocument?.prefabs ?? {})
    if (ids.length === 0) {
      alert('No prefabs in scene. Create one first.')
      return
    }
    const prefabId = prompt(`Prefab id (${ids.join(', ')})`, ids[0])
    if (!prefabId || !sceneDocument?.prefabs[prefabId]) return
    executeCommand(new PlacePrefabCommand(prefabId, [0, 0, 0]))
  }, [sceneDocument])

  const onUndo = useCallback(() => globalCommandBus.undo(), [commandRevision])
  const onRedo = useCallback(() => globalCommandBus.redo(), [commandRevision])

  const menus = useMemo(
    () => [
      {
        id: 'file',
        label: 'File',
        items: [
          {
            id: 'create-new',
            label: 'Create New…',
            disabled: !projectService.isFileSystemAccessSupported(),
            onClick: onCreateProject,
          },
          { id: 'open', label: 'Open…', onClick: onOpenProject },
          { id: 'save', label: 'Save', disabled: !scenePath || mode === 'play', onClick: onSave },
          { id: 'demo', label: 'Demo Scene', onClick: onLoadPlayground },
        ],
      },
    ],
    [mode, onCreateProject, onLoadPlayground, onOpenProject, onSave, scenePath],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          gap: 12,
          padding: '8px 12px',
          background: '#12121a',
          borderBottom: '1px solid #333',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ color: '#eee', marginRight: 4 }}>@haku Editor</strong>
        <MenuBar menus={menus} />
        <button type="button" onClick={onUndo} disabled={!globalCommandBus.canUndo() || mode === 'play'}>Undo</button>
        <button type="button" onClick={onRedo} disabled={!globalCommandBus.canRedo() || mode === 'play'}>Redo</button>
        <button type="button" onClick={onCreatePrefab} disabled={!selection || mode === 'play'}>Create Prefab</button>
        <button type="button" onClick={onPlacePrefab} disabled={mode === 'play'}>Place Prefab</button>
        {mode === 'edit' ? (
          <button type="button" onClick={enterPlayMode} disabled={!scenePath}>▶ Play</button>
        ) : (
          <button type="button" onClick={exitPlayMode}>■ Stop</button>
        )}
        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 12 }}>
          {scenePath ?? 'No scene loaded'} · {mode}
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorLayout />
      </div>
    </div>
  )
})

export { useEditorStore, projectService, globalCommandBus }
