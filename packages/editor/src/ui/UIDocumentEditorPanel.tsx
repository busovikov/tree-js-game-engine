import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { TEXTURE_ASSET_TYPE } from '@haku/assets'
import { UIDocumentInstance, type UIElement, type UIElementId, type UIThemeId } from '@haku/ui'
import { assetId, assetRef, projectPathToUrl } from '@haku/schema'
import { NumberField } from '../components/NumberField.js'
import { projectService } from '../services/project-service.js'
import {
  UI_DESKTOP_VIEWPORTS,
  type UIHierarchyItem,
  type UIDesktopViewportId,
} from './ui-authoring-session.js'
import { uiAuthoringSession, uiCommandBus } from './ui-editor-service.js'
import './ui-document-editor-panel.css'
import { subscribeBuildDiagnosticNavigation } from '../build/build-diagnostic-navigation.js'

function confirmDiscard(): boolean {
  return !uiAuthoringSession.isDirty || window.confirm('Discard unsaved UI changes?')
}

function HierarchyNode({
  item,
  selected,
  onSelect,
}: {
  item: UIHierarchyItem
  selected: UIElementId | null
  onSelect: (id: UIElementId) => void
}) {
  return (
    <li>
      <button
        type="button"
        data-haku-ui-tree-item={item.id}
        data-haku-ui-selected={item.id === selected ? 'true' : 'false'}
        className={item.id === selected ? 'haku-ui-editor__tree-item--selected' : undefined}
        onClick={() => onSelect(item.id)}
      >
        <span aria-hidden="true">{item.type === 'frame' ? '▣' : item.type === 'text' ? 'T' : item.type === 'button' ? '◉' : '▧'}</span>
        {item.name}
      </button>
      {item.children.length > 0 && (
        <ul>
          {item.children.map((child) => (
            <HierarchyNode
              key={child.id}
              item={child}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function UIInspector({ element }: { element: UIElement }) {
  const update = (patch: Record<string, unknown>) =>
    uiAuthoringSession.updateElement(element.id, patch)
  const numericWidth = element.sizing.width.mode === 'fixed' && element.sizing.width.unit === 'px' ? element.sizing.width.value : 0
  const numericHeight = element.sizing.height.mode === 'fixed' && element.sizing.height.unit === 'px' ? element.sizing.height.value : 0

  return (
    <div className="haku-ui-editor__inspector-fields">
      <label className="mesh-field">
        <span className="mesh-field__label">Name</span>
        <input
          className="mesh-field__input"
          value={element.name ?? ''}
          onChange={(event) => update({ name: event.target.value || element.type })}
        />
      </label>
      <label className="haku-ui-editor__checkbox">
        <input
          type="checkbox"
          checked={element.visible}
          onChange={(event) => update({ visible: event.target.checked })}
        />
        Visible
      </label>
      <label className="haku-ui-editor__checkbox">
        <input
          type="checkbox"
          checked={element.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        Enabled
      </label>
      {(element.type === 'text' || element.type === 'button') && (
        <label className="mesh-field">
          <span className="mesh-field__label">Text</span>
          <input
            className="mesh-field__input"
            value={element.text}
            onChange={(event) => update({ text: event.target.value })}
          />
        </label>
      )}
      {element.type === 'image' && (
        <label className="mesh-field">
          <span className="mesh-field__label">Alt text</span>
          <input
            className="mesh-field__input"
            value={element.alt}
            onChange={(event) => update({ alt: event.target.value })}
          />
        </label>
      )}
      <NumberField
        label="Width (px)"
        value={numericWidth}
        min={0}
        step={1}
        onChange={(width) => update({ sizing: { ...element.sizing, width: { mode: 'fixed', value: width, unit: 'px' } } })}
      />
      <NumberField
        label="Height (px)"
        value={numericHeight}
        min={0}
        step={1}
        onChange={(height) => update({ sizing: { ...element.sizing, height: { mode: 'fixed', value: height, unit: 'px' } } })}
      />
      <label className="mesh-field">
        <span className="mesh-field__label">Text color</span>
        <input
          className="mesh-field__input"
          value={element.style.color ?? ''}
          placeholder="#ffffff"
          onChange={(event) =>
            update({ style: { ...element.style, color: event.target.value || undefined } })
          }
        />
      </label>
      <label className="mesh-field">
        <span className="mesh-field__label">Background</span>
        <input
          className="mesh-field__input"
          value={element.style.backgroundColor ?? ''}
          placeholder="#000000"
          onChange={(event) =>
            update({
              style: { ...element.style, backgroundColor: event.target.value || undefined },
            })
          }
        />
      </label>
      <label className="mesh-field">
        <span className="mesh-field__label">Accessible label</span>
        <input
          className="mesh-field__input"
          value={element.accessibility.label ?? ''}
          onChange={(event) =>
            update({
              accessibility: {
                ...element.accessibility,
                label: event.target.value || undefined,
              },
            })
          }
        />
      </label>
      <code>{element.id}</code>
    </div>
  )
}

export const UIDocumentEditorPanel = memo(function UIDocumentEditorPanel() {
  const [, refresh] = useReducer((value) => value + 1, 0)
  const previewHost = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Ready')
  const [previewTheme, setPreviewTheme] = useState<string>('')

  useEffect(() => uiAuthoringSession.subscribe(refresh), [])
  useEffect(() => uiCommandBus.subscribe(refresh), [])
  useEffect(
    () =>
      subscribeBuildDiagnosticNavigation((target) => {
        if (target.workspace !== 'ui') return
        void (async () => {
          try {
            if (uiAuthoringSession.path !== target.path) {
              if (!confirmDiscard()) return
              await uiAuthoringSession.open(target.path)
            }
            if (target.selectionId) uiAuthoringSession.select(target.selectionId)
            setStatus(`Build diagnostic: ${target.path}`)
          } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error))
          }
        })()
      }),
    [],
  )

  const asset = uiAuthoringSession.asset
  const selected = useMemo(
    () =>
      asset?.elements.find((element) => element.id === uiAuthoringSession.selectedElementId) ??
      null,
    [asset, uiAuthoringSession.selectedElementId],
  )
  const hierarchy = asset ? uiAuthoringSession.hierarchy() : []
  const viewport = uiAuthoringSession.viewport

  useEffect(() => {
    const host = previewHost.current
    if (!host || !asset) return
    const instance = new UIDocumentInstance(asset, {
      ...(previewTheme ? { theme: previewTheme as UIThemeId } : {}),
      assets: {
        resolve(reference) {
          const relativePath = projectService.getAssetPath(reference)
          return projectPathToUrl(`${projectService.getAssetsRoot()}/${relativePath}`)
        },
      },
    })
    const unsubscribe = instance.subscribe((event) => {
      setStatus(`Event: ${event.elementId}`)
    })
    try {
      instance.mount(host)
      const selectedNode = uiAuthoringSession.selectedElementId
        ? instance.getElement(uiAuthoringSession.selectedElementId)
        : null
      if (selectedNode) selectedNode.dataset.hakuUiSelected = 'true'
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Preview failed')
    }
    return () => {
      unsubscribe()
      instance.destroy()
    }
  }, [asset, previewTheme, uiAuthoringSession.selectedElementId])

  const createDocument = useCallback(async () => {
    if (!confirmDiscard()) return
    const name = window.prompt('UI document name', 'HUD')?.trim()
    if (!name) return
    const fileName = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'hud'
    const path = window
      .prompt('UI document path', `${projectService.getAssetsRoot()}/ui/${fileName}.ui.json`)
      ?.trim()
    if (!path) return
    try {
      const created = await projectService.createUIDocumentAsset(path, name)
      uiAuthoringSession.openAsset(path, created)
      setStatus(`Created ${path}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Create failed')
    }
  }, [])

  const openDocument = useCallback(async () => {
    if (!confirmDiscard()) return
    const path = window
      .prompt('UI document path', `${projectService.getAssetsRoot()}/ui/hud.ui.json`)
      ?.trim()
    if (!path) return
    try {
      await uiAuthoringSession.open(path)
      setStatus(`Opened ${path}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Open failed')
    }
  }, [])

  if (!asset) {
    return <div className="haku-ui-editor haku-ui-editor--empty">No UI document open</div>
  }

  const parent =
    selected && 'children' in selected ? selected.id : uiAuthoringSession.asset?.root

  const add = (type: UIElement['type']) => {
    if (!parent) return
    try {
      if (type === 'image') {
        const textureId = window.prompt('Texture asset UUID')?.trim()
        if (!textureId) return
        uiAuthoringSession.addElement(parent, type, {
          source: assetRef(assetId(textureId), TEXTURE_ASSET_TYPE),
        })
      } else {
        uiAuthoringSession.addElement(parent, type)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Add failed')
    }
  }

  return (
    <section
      className="haku-ui-editor"
      aria-label="UI document editor"
      data-haku-ui-workspace="true"
      data-haku-ui-document-path={uiAuthoringSession.path ?? undefined}
      data-haku-ui-selected-id={uiAuthoringSession.selectedElementId ?? undefined}
    >
      <div className="haku-ui-editor__toolbar">
        <button type="button" onClick={() => void createDocument()}>New</button>
        <button type="button" onClick={() => void openDocument()}>Open</button>
        <button
          type="button"
          data-haku-ui-action="save"
          disabled={!uiAuthoringSession.isDirty || uiAuthoringSession.path?.startsWith('builtin:')}
          onClick={() =>
            void uiAuthoringSession.save().then(
              () => setStatus(`Saved ${uiAuthoringSession.path}`),
              (error: unknown) => setStatus(error instanceof Error ? error.message : 'Save failed'),
            )
          }
        >
          Save
        </button>
        <button type="button" disabled={!uiCommandBus.canUndo()} onClick={() => uiCommandBus.undo()}>
          Undo
        </button>
        <button type="button" disabled={!uiCommandBus.canRedo()} onClick={() => uiCommandBus.redo()}>
          Redo
        </button>
        <label>
          Preview
          <select
            aria-label="UI preview viewport"
            value={viewport.id}
            onChange={(event) =>
              uiAuthoringSession.setViewport(event.target.value as UIDesktopViewportId)
            }
          >
            {Object.values(UI_DESKTOP_VIEWPORTS).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
            ))}
          </select>
        </label>
        <label>
          Theme
          <select
            aria-label="UI preview theme"
            value={previewTheme}
            onChange={(event) => setPreviewTheme(event.target.value)}
          >
            <option value="">Base</option>
            {asset.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.name}</option>
            ))}
          </select>
        </label>
        <span>{uiAuthoringSession.path}{uiAuthoringSession.isDirty ? ' *' : ''}</span>
      </div>
      <div className="haku-ui-editor__workspace">
        <aside className="haku-ui-editor__hierarchy">
          <h3>UI Hierarchy</h3>
          <div className="haku-ui-editor__palette">
            {(['frame', 'text', 'button', 'image'] as const).map((type) => (
              <button key={type} type="button" onClick={() => add(type)}>+ {type}</button>
            ))}
          </div>
          <ul>
            {hierarchy.map((item) => (
              <HierarchyNode
                key={item.id}
                item={item}
                selected={uiAuthoringSession.selectedElementId}
                onSelect={(id) => uiAuthoringSession.select(id)}
              />
            ))}
          </ul>
          <button
            type="button"
            disabled={!selected || selected.id === asset.root}
            onClick={() => selected && uiAuthoringSession.removeElement(selected.id)}
          >
            Delete selected
          </button>
        </aside>
        <main className="haku-ui-editor__preview">
          <div className="haku-ui-editor__viewport-label">{viewport.label}</div>
          <div className="haku-ui-editor__viewport-scroll">
            <div
              ref={previewHost}
              className="haku-ui-editor__viewport"
              data-haku-ui-preview="true"
              data-haku-ui-preview-scale="0.5"
              data-haku-ui-preview-origin="top-left"
              style={{ width: viewport.width, height: viewport.height }}
            />
          </div>
          <output aria-live="polite" data-haku-ui-status="true">{status}</output>
        </main>
        <aside className="haku-ui-editor__inspector">
          <h3>UI Inspector</h3>
          {selected ? <UIInspector element={selected} /> : <p>Select a UI element</p>}
        </aside>
      </div>
    </section>
  )
})
