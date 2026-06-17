import { memo, useEffect, useState } from 'react'
import type { RenderSettings } from '@haku/schema'
import { defaultRenderSettings } from '@haku/schema'
import { FeaturesTab, OutputTab, PostTab, ShadowsTab } from './render-settings/RenderSettingsTabs.js'

type TabId = 'features' | 'output' | 'shadows' | 'post'

const TABS: { id: TabId; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'output', label: 'Output' },
  { id: 'shadows', label: 'Shadows' },
  { id: 'post', label: 'Post' },
]

export const RenderSettingsDialog = memo(function RenderSettingsDialog({
  open,
  initialSettings,
  onApply,
  onClose,
}: {
  open: boolean
  initialSettings?: RenderSettings
  onApply: (settings: RenderSettings) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<TabId>('features')
  const [draft, setDraft] = useState<RenderSettings>(defaultRenderSettings())

  useEffect(() => {
    if (open) {
      setDraft(initialSettings ?? defaultRenderSettings())
      setTab('features')
    }
  }, [open, initialSettings])

  if (!open) return null

  const apply = () => {
    onApply(draft)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1e1e2e',
          border: '1px solid #444',
          borderRadius: 8,
          width: 420,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={{ padding: '12px 16px', borderBottom: '1px solid #333' }}>
          <strong style={{ color: '#eee' }}>Render Settings</strong>
        </header>
        <nav style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid #333' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '4px 10px',
                background: tab === t.id ? '#333' : 'transparent',
                color: '#ccc',
                border: '1px solid #444',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
          {tab === 'features' && <FeaturesTab settings={draft} onChange={setDraft} />}
          {tab === 'output' && <OutputTab settings={draft} onChange={setDraft} />}
          {tab === 'shadows' && <ShadowsTab settings={draft} onChange={setDraft} />}
          {tab === 'post' && <PostTab settings={draft} onChange={setDraft} />}
        </div>
        <footer
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #333',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={apply}>Apply</button>
        </footer>
      </div>
    </div>
  )
})
