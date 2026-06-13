import { memo } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { HierarchyPanel } from './panels/HierarchyPanel.js'
import { HierarchyToolsPanel } from './panels/HierarchyToolsPanel.js'
import { InspectorPanel } from './panels/InspectorPanel.js'
import { ViewportPanel } from './panels/ViewportPanel.js'
import { AssetBrowserPanel } from './panels/AssetBrowserPanel.js'
import './editor-layout.css'

const panelShell = 'haku-panel-shell'

function ResizeHandle({ direction }: { direction: 'horizontal' | 'vertical' }) {
  return (
    <PanelResizeHandle
      className={`haku-resize-handle haku-resize-handle--${direction}`}
    />
  )
}

export const EditorLayout = memo(function EditorLayout() {
  return (
    <div className="haku-editor-layout">
      <PanelGroup direction="horizontal" autoSaveId="haku-editor-panels-h">
        <Panel defaultSize={18} minSize={12} maxSize={35} className={panelShell}>
          <div className="haku-hierarchy-column">
            <HierarchyPanel />
            <HierarchyToolsPanel />
          </div>
        </Panel>

        <ResizeHandle direction="horizontal" />

        <Panel defaultSize={58} minSize={35} className={panelShell}>
          <PanelGroup direction="vertical" autoSaveId="haku-editor-panels-v">
            <Panel defaultSize={72} minSize={35} className={panelShell}>
              <ViewportPanel />
            </Panel>

            <ResizeHandle direction="vertical" />

            <Panel defaultSize={28} minSize={15} maxSize={50} className={panelShell}>
              <AssetBrowserPanel />
            </Panel>
          </PanelGroup>
        </Panel>

        <ResizeHandle direction="horizontal" />

        <Panel defaultSize={24} minSize={16} maxSize={40} className={panelShell}>
          <InspectorPanel />
        </Panel>
      </PanelGroup>
    </div>
  )
})
