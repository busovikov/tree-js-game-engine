import { memo, useCallback } from 'react'
import { EditorLayout } from './EditorLayout.js'
import { useEditorStore } from './store/editor-store.js'
import { projectService } from './services/project-service.js'
import { globalCommandBus } from './commands/command-bus.js'
import {
  CreatePrefabCommand,
  PlacePrefabCommand,
  executeCommand,
} from './commands/world-commands.js'

export const EditorApp = memo(function EditorApp() {
  const mode = useEditorStore((s) => s.mode)
  const scenePath = useEditorStore((s) => s.scenePath)
  const selection = useEditorStore((s) => s.selection)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const commandRevision = useEditorStore((s) => s.commandRevision)
  const enterPlayMode = useEditorStore((s) => s.enterPlayMode)
  const exitPlayMode = useEditorStore((s) => s.exitPlayMode)

  const onOpenProject = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    ;(input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true
    input.onchange = () => {
      if (!input.files?.length) return
      void projectService.openFromFileList(input.files).catch((err: Error) => {
        alert(err.message)
      })
    }
    input.click()
  }, [])

  const onLoadPlayground = useCallback(async () => {
    const sceneUrl = '/playground-assets/scenes/menu.scene.json'
    const res = await fetch(sceneUrl)
    const document = await res.json()
    const { loadSceneDocument } = await import('@haku/serializer')
    const world = loadSceneDocument(document, { expandPrefabs: false })
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
    await projectService.seedVirtualAssets([
      { path: 'assets/scenes/menu.scene.json', url: sceneUrl },
    ])
    useEditorStore.getState().setProjectRoot('playground')
    useEditorStore.getState().setScene('assets/scenes/menu.scene.json', document, world)
  }, [])

  const onSave = useCallback(async () => {
    const { world, sceneDocument, scenePath } = useEditorStore.getState()
    if (!world || !sceneDocument || !scenePath) return

    const saved = await projectService.saveScene(scenePath, world, sceneDocument)
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = scenePath.split('/').pop() ?? 'scene.scene.json'
    a.click()
    URL.revokeObjectURL(url)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          gap: 8,
          padding: '8px 12px',
          background: '#12121a',
          borderBottom: '1px solid #333',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ color: '#eee', marginRight: 12 }}>@haku Editor</strong>
        <button type="button" onClick={onLoadPlayground}>Demo Scene</button>
        <button type="button" onClick={onOpenProject}>Open Project…</button>
        <button type="button" onClick={onSave} disabled={!scenePath || mode === 'play'}>Save</button>
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
