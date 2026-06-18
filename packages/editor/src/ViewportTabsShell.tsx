import { memo } from 'react'
import { useEditorStore } from './store/editor-store.js'
import { projectService } from './services/project-service.js'
import { ViewportPanel } from './panels/ViewportPanel.js'
import './viewport-tabs.css'

export const ViewportTabsShell = memo(function ViewportTabsShell() {
  const activeViewportTab = useEditorStore((s) => s.activeViewportTab)
  const setActiveViewportTab = useEditorStore((s) => s.setActiveViewportTab)
  const scenePath = useEditorStore((s) => s.scenePath)
  const mode = useEditorStore((s) => s.mode)

  const onSelectTab = (tab: 'scene' | 'view') => {
    setActiveViewportTab(tab)
    if (!scenePath) return
    const state = projectService.getSceneEditorState(scenePath)
    void projectService.persistSceneWorkspace(scenePath, state.editorCamera, tab)
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
            onClick={() => onSelectTab('scene')}
          >
            Scene
          </button>
          <button
            type="button"
            role="tab"
            className={`haku-viewport-tab${activeViewportTab === 'view' ? ' haku-viewport-tab--active' : ''}`}
            aria-selected={activeViewportTab === 'view'}
            onClick={() => onSelectTab('view')}
          >
            View
          </button>
        </div>
        {mode === 'play' && activeViewportTab === 'view' && (
          <span className="haku-viewport-shell__play-badge">PLAYING</span>
        )}
      </div>
      <div className="haku-viewport-shell__body">
        <ViewportPanel />
      </div>
    </div>
  )
})
