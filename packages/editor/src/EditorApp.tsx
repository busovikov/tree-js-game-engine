import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { setHakuLogSink } from '@haku/engine'
import { EditorLayout } from './EditorLayout.js'
import { MenuBar } from './components/MenuBar.js'
import { WelcomeScreen } from './components/WelcomeScreen.js'
import { RenderSettingsDialog } from './components/RenderSettingsDialog.js'
import { PhysicsProjectSettingsDialog } from './components/PhysicsProjectSettingsDialog.js'
import { commitSceneEdit } from './commands/scene-history.js'
import { useEditorStore } from './store/editor-store.js'
import { projectService } from './services/project-service.js'
import { PLAYGROUND_DEMO_SCENES } from './services/playground-demos.js'
import { projectLogSink } from './services/project-log-sink.js'
import { confirmDiscardChanges, prepareBeforeUnload } from './services/unsaved-changes.js'
import { globalCommandBus } from './commands/command-bus.js'
import {
  createPrefab,
  placePrefab,
} from './commands/world-commands.js'
import { primarySelection } from './selection/selection-utils.js'
import {
  handleDeleteShortcut,
  handleDuplicateShortcut,
  handleTransformToolShortcut,
} from './viewport/transform-tool-shortcuts.js'
import { handleSaveShortcut } from './commands/editor-shortcuts.js'

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
  const primary = primarySelection(selection)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const commandRevision = useEditorStore((s) => s.commandRevision)
  const isDirty = useEditorStore((s) => s.isDirty)
  const enterPlayMode = useEditorStore((s) => s.enterPlayMode)
  const exitPlayMode = useEditorStore((s) => s.exitPlayMode)
  const [renderSettingsOpen, setRenderSettingsOpen] = useState(false)
  const [physicsSettingsOpen, setPhysicsSettingsOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    setHakuLogSink(projectLogSink)
    return () => setHakuLogSink(null)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('hakuOpenTarget') !== '1' && !params.has('hakuOpenProject')) {
      return
    }

    void projectService.openFromDevPath().catch((err) => {
      alert(err instanceof Error ? err.message : 'Failed to open dev target project')
    })
  }, [])

  const onOpenProject = useCallback(async () => {
    if (!confirmDiscardChanges(useEditorStore.getState().isDirty, window.confirm.bind(window))) {
      return
    }
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
    if (!confirmDiscardChanges(useEditorStore.getState().isDirty, window.confirm.bind(window))) {
      return
    }
    try {
      await projectService.createNewProject()
    } catch (err) {
      if (isAbortError(err)) return
      alert(err instanceof Error ? err.message : 'Failed to create project')
    }
  }, [])

  const onLoadPlaygroundDemo = useCallback(async (scenePath: string) => {
    if (!confirmDiscardChanges(useEditorStore.getState().isDirty, window.confirm.bind(window))) {
      return
    }
    try {
      await projectService.openPlaygroundDemo(scenePath)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load demo scene')
    }
  }, [])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => prepareBeforeUnload(event, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const onSave = useCallback(async () => {
    const { world, sceneDocument, scenePath } = useEditorStore.getState()
    if (!world || !sceneDocument || !scenePath) return

    setSaveStatus('saving')
    try {
      await projectService.saveScene(scenePath, world, sceneDocument)
      setSaveStatus('saved')
    } catch (err) {
      setSaveStatus('error')
      alert(err instanceof Error ? err.message : 'Failed to save scene')
    }
  }, [])

  useEffect(() => {
    if (isDirty) setSaveStatus('idle')
  }, [isDirty])

  const onCreatePrefab = useCallback(async () => {
    if (!primary) return
    const prefabName = prompt(
      'Prefab name',
      `${useEditorStore.getState().world?.getEntityName(primary) ?? 'prefab'}`.toLowerCase(),
    )
    if (!prefabName) return
    try {
      await createPrefab(primary, prefabName)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create prefab')
    }
  }, [primary])

  const onPlacePrefab = useCallback(() => {
    const prefabs = projectService.listPrefabAssetRefs()
    if (prefabs.length === 0) {
      alert('No prefab assets in project. Create one first.')
      return
    }
    const selected = prompt(
      `Prefab asset ID (${prefabs.map((prefab) => prefab.$ref).join(', ')})`,
      prefabs[0]?.$ref,
    )
    const prefab = prefabs.find((candidate) => candidate.$ref === selected)
    if (!prefab) return
    placePrefab(prefab, [0, 0, 0])
  }, [])

  const onUndo = useCallback(() => {
    if (useEditorStore.getState().mode === 'play') return
    globalCommandBus.undo()
  }, [commandRevision])

  const onRedo = useCallback(() => {
    if (useEditorStore.getState().mode === 'play') return
    globalCommandBus.redo()
  }, [commandRevision])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (handleDeleteShortcut(event)) return
      if (handleDuplicateShortcut(event)) return
      if (handleTransformToolShortcut(event)) return

      const state = useEditorStore.getState()
      if (
        handleSaveShortcut(
          event,
          state.mode === 'edit' && !!state.scenePath && saveStatus !== 'saving',
          () => void onSave(),
        )
      ) {
        return
      }

      if (state.mode === 'play') return
      if (event.repeat) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (event.key.toLowerCase() !== 'z') return

      event.preventDefault()
      if (event.shiftKey) {
        if (globalCommandBus.canRedo()) globalCommandBus.redo()
      } else if (globalCommandBus.canUndo()) {
        globalCommandBus.undo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSave, saveStatus])

  const onRenderSettings = useCallback(() => {
    setRenderSettingsOpen(true)
  }, [])

  const onApplyRenderSettings = useCallback((renderSettings: import('@haku/schema').RenderSettings) => {
    commitSceneEdit((draft) => {
      if (draft.sceneDocument) {
        draft.sceneDocument.renderSettings = renderSettings
      }
    })
  }, [])

  const onPhysicsSettings = useCallback(() => {
    setPhysicsSettingsOpen(true)
  }, [])

  const onApplyPhysicsSettings = useCallback(
    (physicsSettings: import('@haku/schema').PhysicsProjectSettings) => {
      commitSceneEdit((draft) => {
        if (draft.sceneDocument) {
          draft.sceneDocument.physicsSettings = physicsSettings
        }
      })
    },
    [],
  )

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
          {
            id: 'save',
            label: saveStatus === 'saving' ? 'Saving…' : 'Save',
            shortcut: '⌘/Ctrl S',
            disabled: !scenePath || mode === 'play' || saveStatus === 'saving',
            onClick: onSave,
          },
        ],
      },
      {
        id: 'demos',
        label: 'Demos',
        items: PLAYGROUND_DEMO_SCENES.map((demo) => ({
          id: demo.id,
          label: demo.label,
          onClick: () => onLoadPlaygroundDemo(demo.scenePath),
        })),
      },
      {
        id: 'view',
        label: 'View',
        items: [
          {
            id: 'render-settings',
            label: 'Render Settings…',
            disabled: !sceneDocument || mode === 'play',
            onClick: onRenderSettings,
          },
          {
            id: 'physics-settings',
            label: 'Physics Settings…',
            disabled: !sceneDocument || mode === 'play',
            onClick: onPhysicsSettings,
          },
        ],
      },
    ],
    [
      mode,
      onCreateProject,
      onLoadPlaygroundDemo,
      onOpenProject,
      onPhysicsSettings,
      onRenderSettings,
      onSave,
      sceneDocument,
      scenePath,
      saveStatus,
    ],
  )

  const hasPrefabs = projectService.listPrefabAssetRefs().length > 0

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
        <button type="button" onClick={onCreatePrefab} disabled={!primary || mode === 'play'}>Create Prefab</button>
        <button type="button" onClick={onPlacePrefab} disabled={mode === 'play' || !hasPrefabs}>Place Prefab</button>
        {mode === 'edit' ? (
          <button type="button" onClick={enterPlayMode} disabled={!scenePath}>▶ Play</button>
        ) : (
          <button type="button" onClick={exitPlayMode}>■ Stop</button>
        )}
        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 12 }}>
          {scenePath ?? 'No scene loaded'}{isDirty ? ' *' : ''} · {mode}
        </span>
        {saveStatus !== 'idle' && (
          <span role="status" style={{ color: saveStatus === 'error' ? '#ff8a80' : '#8f9', fontSize: 12 }}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}
          </span>
        )}
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        {scenePath ? (
          <EditorLayout />
        ) : (
          <WelcomeScreen
            canCreate={projectService.isFileSystemAccessSupported()}
            onOpen={onOpenProject}
            onCreate={onCreateProject}
            onTryDemo={() => onLoadPlaygroundDemo(PLAYGROUND_DEMO_SCENES[0]!.scenePath)}
          />
        )}
      </div>
      <RenderSettingsDialog
        open={renderSettingsOpen}
        initialSettings={sceneDocument?.renderSettings}
        onApply={onApplyRenderSettings}
        onClose={() => setRenderSettingsOpen(false)}
      />
      <PhysicsProjectSettingsDialog
        open={physicsSettingsOpen}
        initialSettings={sceneDocument?.physicsSettings}
        onApply={onApplyPhysicsSettings}
        onClose={() => setPhysicsSettingsOpen(false)}
      />
    </div>
  )
})

export { useEditorStore, projectService, globalCommandBus }
