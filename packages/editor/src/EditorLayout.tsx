import { memo } from 'react'
import { HierarchyPanel } from './panels/HierarchyPanel.js'
import { InspectorPanel } from './panels/InspectorPanel.js'
import { ViewportPanel } from './panels/ViewportPanel.js'
import { AssetBrowserPanel } from './panels/AssetBrowserPanel.js'

const panelStyle: React.CSSProperties = {
  border: '1px solid #333',
  overflow: 'hidden',
  minHeight: 0,
}

export const EditorLayout = memo(function EditorLayout() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr 280px',
        gridTemplateRows: '1fr 180px',
        width: '100vw',
        height: '100vh',
        background: '#1a1a2e',
      }}
    >
      <div style={{ ...panelStyle, gridRow: '1 / 3' }}>
        <HierarchyPanel />
      </div>
      <div style={panelStyle}>
        <ViewportPanel />
      </div>
      <div style={panelStyle}>
        <InspectorPanel />
      </div>
      <div style={{ ...panelStyle, gridColumn: 2 }}>
        <AssetBrowserPanel />
      </div>
    </div>
  )
})
