import { memo, useEffect, useState } from 'react'
import { useEditorStore } from './store/editor-store.js'
import { projectService } from './services/project-service.js'
import { ViewportPanel } from './panels/ViewportPanel.js'
import { ViewportErrorBoundary } from './components/ViewportErrorBoundary.js'
import { PlaygroundDemoBanner } from './components/PlaygroundDemoBanner.js'
import { GraphEditorPanel } from './graph/GraphEditorPanel.js'
import { ProjectCodeWorkspacePanel } from './code/ProjectCodeWorkspacePanel.js'
import { UIDocumentEditorPanel } from './ui/UIDocumentEditorPanel.js'
import { UI_WORKSPACE_OPEN_EVENT } from './ui/ui-editor-service.js'
import './viewport-tabs.css'

export const ViewportTabsShell = memo(function ViewportTabsShell() {
  const [workspace, setWorkspace] = useState<'viewport' | 'graph' | 'code' | 'ui'>('viewport')
  const activeViewportTab = useEditorStore((s) => s.activeViewportTab)
  const setActiveViewportTab = useEditorStore((s) => s.setActiveViewportTab)
  const scenePath = useEditorStore((s) => s.scenePath)
  const mode = useEditorStore((s) => s.mode)
  const worldRevision = useEditorStore((s) => s.worldRevision)

  useEffect(() => {
    const openUIWorkspace = () => setWorkspace('ui')
    window.addEventListener(UI_WORKSPACE_OPEN_EVENT, openUIWorkspace)
    return () => window.removeEventListener(UI_WORKSPACE_OPEN_EVENT, openUIWorkspace)
  }, [])

  const onSelectTab = (tab: 'scene' | 'view') => {
    setActiveViewportTab(tab)
    if (!scenePath) return
    const state = projectService.getSceneEditorState(scenePath)
    projectService.persistSceneWorkspaceInBackground(scenePath, state.editorCamera, tab)
  }

  return (
    <div className="haku-viewport-shell">
      <div className="haku-viewport-shell__header">
        <div className="haku-viewport-tabs" role="tablist" aria-label="Viewport">
          <button
            type="button"
            role="tab"
            className={`haku-viewport-tab${activeViewportTab === 'scene' ? ' haku-viewport-tab--active' : ''}`}
            aria-selected={activeViewportTab === 'scene'}
            onClick={() => {
              setWorkspace('viewport')
              onSelectTab('scene')
            }}
          >
            Scene
          </button>
          <button
            type="button"
            role="tab"
            className={`haku-viewport-tab${activeViewportTab === 'view' ? ' haku-viewport-tab--active' : ''}`}
            aria-selected={activeViewportTab === 'view'}
            onClick={() => {
              setWorkspace('viewport')
              onSelectTab('view')
            }}
          >
            View
          </button>
          <button
            type="button"
            role="tab"
            className={`haku-viewport-tab${workspace === 'graph' ? ' haku-viewport-tab--active' : ''}`}
            aria-selected={workspace === 'graph'}
            onClick={() => setWorkspace('graph')}
          >
            Graph
          </button>
          <button
            type="button"
            role="tab"
            className={`haku-viewport-tab${workspace === 'ui' ? ' haku-viewport-tab--active' : ''}`}
            aria-selected={workspace === 'ui'}
            onClick={() => setWorkspace('ui')}
          >
            UI
          </button>
          <button
            type="button"
            role="tab"
            className={`haku-viewport-tab${workspace === 'code' ? ' haku-viewport-tab--active' : ''}`}
            aria-selected={workspace === 'code'}
            onClick={() => setWorkspace('code')}
          >
            Code
          </button>
        </div>
        {mode === 'play' && activeViewportTab === 'view' && (
          <span className="haku-viewport-shell__play-badge">PLAYING</span>
        )}
      </div>
      {workspace === 'viewport' && <PlaygroundDemoBanner scenePath={scenePath} />}
      <div className="haku-viewport-shell__body">
        {workspace === 'graph' ? (
          <GraphEditorPanel />
        ) : workspace === 'ui' ? (
          <UIDocumentEditorPanel />
        ) : workspace === 'code' ? (
          <ProjectCodeWorkspacePanel />
        ) : (
          <ViewportErrorBoundary resetKey={`${scenePath ?? 'empty'}:${worldRevision}`}>
            <ViewportPanel />
          </ViewportErrorBoundary>
        )}
      </div>
    </div>
  )
})
