import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  UIDocumentInstance,
  type UIDocument,
  type UIElement,
  type UIElementId,
  type UIThemeId,
} from '@haku/ui'
import { projectPathToUrl } from '@haku/schema'
import { NumberField } from '../components/NumberField.js'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { AssetBrowserPanel } from '../panels/AssetBrowserPanel.js'
import { projectService } from '../services/project-service.js'
import {
  UI_DESKTOP_VIEWPORTS,
  type UIHierarchyItem,
  type UIDesktopViewportId,
} from './ui-authoring-session.js'
import { uiAuthoringSession, uiCommandBus } from './ui-editor-service.js'
import {
  fitCanvasView,
  fitCanvasBounds,
  canvasPointToDocument,
  panCanvasView,
  resizeCanvasView,
  setCanvasZoom,
  type UICanvasSize,
  type UICanvasView,
} from './ui-canvas-transform.js'
import { cycleCanvasHit, orderCanvasHits } from './ui-canvas-selection.js'
import {
  clampUIRect,
  resizeDimensionIntent,
  snapUIRect,
  type UIRect,
  type UISnapCandidate,
} from './ui-gesture-transaction.js'
import './ui-document-editor-panel.css'
import { subscribeBuildDiagnosticNavigation } from '../build/build-diagnostic-navigation.js'
import {
  moveUIElements,
  resolveUICreationTarget,
  type UIHierarchyDropPosition,
} from './ui-hierarchy-commands.js'

function confirmDiscard(): boolean {
  return !uiAuthoringSession.isDirty || window.confirm('Discard unsaved UI changes?')
}

type UIResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

type UIGesture =
  | {
      readonly kind: 'pan'
      readonly pointerId: number
      readonly start: { readonly x: number; readonly y: number }
      readonly view: UICanvasView
    }
  | {
      readonly kind: 'move' | 'resize'
      readonly pointerId: number
      readonly start: { readonly x: number; readonly y: number }
      readonly ids: readonly UIElementId[]
      readonly before: ReadonlyMap<UIElementId, UIRect>
      readonly styles: ReadonlyMap<UIElementId, string>
      readonly handle?: UIResizeHandle
    }

function elementParents(asset: UIDocument): ReadonlyMap<string, string> {
  const parents = new Map<string, string>()
  for (const element of asset.elements) {
    if ('children' in element) for (const child of element.children) parents.set(child, element.id)
  }
  return parents
}

function unionRects(rects: readonly UIRect[]): UIRect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function fallbackElementBounds(
  asset: UIDocument,
  rootSize: UICanvasSize,
): Map<UIElementId, UIRect> {
  const byId = new Map(asset.elements.map((element) => [element.id, element]))
  const bounds = new Map<UIElementId, UIRect>()
  const visit = (id: UIElementId, parent: UIRect): void => {
    const element = byId.get(id)
    if (!element) return
    const placement = element.placement
    const x =
      id === asset.root ? 0 : parent.x + (placement.positioning === 'free' ? placement.x : 0)
    const y =
      id === asset.root ? 0 : parent.y + (placement.positioning === 'free' ? placement.y : 0)
    const width =
      id === asset.root
        ? rootSize.width
        : element.sizing.width.mode === 'fixed' && element.sizing.width.unit === 'px'
          ? element.sizing.width.value
          : 120
    const height =
      id === asset.root
        ? rootSize.height
        : element.sizing.height.mode === 'fixed' && element.sizing.height.unit === 'px'
          ? element.sizing.height.value
          : 48
    const rect = { x, y, width: Math.max(1, width), height: Math.max(1, height) }
    bounds.set(id, rect)
    if ('children' in element) for (const child of element.children) visit(child, rect)
  }
  visit(asset.root, { x: 0, y: 0, width: rootSize.width, height: rootSize.height })
  return bounds
}

function resizeRect(before: UIRect, handle: UIResizeHandle, dx: number, dy: number): UIRect {
  const west = handle.includes('w')
  const north = handle.includes('n')
  const east = handle.includes('e')
  const south = handle.includes('s')
  return {
    x: west ? before.x + dx : before.x,
    y: north ? before.y + dy : before.y,
    width: Math.max(1, before.width + (east ? dx : west ? -dx : 0)),
    height: Math.max(1, before.height + (south ? dy : north ? -dy : 0)),
  }
}

function resizeHandlePoint(rect: UIRect, handle: UIResizeHandle) {
  return {
    left: handle.includes('w')
      ? rect.x
      : handle.includes('e')
        ? rect.x + rect.width
        : rect.x + rect.width / 2,
    top: handle.includes('n')
      ? rect.y
      : handle.includes('s')
        ? rect.y + rect.height
        : rect.y + rect.height / 2,
  }
}

function restoreInlineStyle(node: HTMLElement, style: string): void {
  if (style) node.setAttribute('style', style)
  else node.removeAttribute('style')
}

type UICreatableType = Exclude<UIElement['type'], 'instance'>

const UI_PALETTE: readonly {
  readonly type: UICreatableType
  readonly label: string
  readonly icon: string
}[] = [
  { type: 'frame', label: 'Frame', icon: '▣' },
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'image', label: 'Image', icon: '▧' },
  { type: 'button', label: 'Button', icon: '◉' },
  { type: 'rectangle', label: 'Rectangle', icon: '□' },
  { type: 'text-input', label: 'Text Input', icon: '⌨' },
  { type: 'text-area', label: 'Text Area', icon: '¶' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑' },
  { type: 'radio', label: 'Radio', icon: '◉' },
  { type: 'switch', label: 'Switch', icon: '◐' },
  { type: 'select', label: 'Select', icon: '▾' },
  { type: 'slider', label: 'Slider', icon: '↔' },
  { type: 'progress', label: 'Progress', icon: '▰' },
  { type: 'divider', label: 'Divider', icon: '—' },
  { type: 'spacer', label: 'Spacer', icon: '↕' },
  { type: 'scroll-container', label: 'Scroll Container', icon: '▤' },
  { type: 'list', label: 'List', icon: '☷' },
]

function layerIcon(type: UIElement['type']): string {
  return UI_PALETTE.find((entry) => entry.type === type)?.icon ?? '◇'
}

interface UIDropIndicator {
  readonly targetId: UIElementId
  readonly position: UIHierarchyDropPosition
  readonly valid: boolean
}

function flattenHierarchy(
  items: readonly UIHierarchyItem[],
  expanded: ReadonlySet<UIElementId>,
): readonly UIHierarchyItem[] {
  const result: UIHierarchyItem[] = []
  const visit = (item: UIHierarchyItem): void => {
    result.push(item)
    if (expanded.has(item.id)) for (const child of item.children) visit(child)
  }
  for (const item of items) visit(item)
  return result
}

function HierarchyNode({
  item,
  rootId,
  elements,
  selected,
  expanded,
  renamingId,
  dropIndicator,
  onSelect,
  onToggle,
  onBeginRename,
  onCommitRename,
  onCancelRename,
  onVisible,
  onLock,
  onDuplicate,
  onDelete,
  onKeyDown,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  item: UIHierarchyItem
  rootId: UIElementId
  elements: ReadonlyMap<UIElementId, UIElement>
  selected: readonly UIElementId[]
  expanded: ReadonlySet<UIElementId>
  renamingId: UIElementId | null
  dropIndicator: UIDropIndicator | null
  onSelect: (id: UIElementId, modified: boolean) => void
  onToggle: (id: UIElementId) => void
  onBeginRename: (id: UIElementId) => void
  onCommitRename: (id: UIElementId, name: string) => void
  onCancelRename: () => void
  onVisible: (id: UIElementId, visible: boolean) => void
  onLock: (id: UIElementId, locked: boolean) => void
  onDuplicate: (id: UIElementId) => void
  onDelete: (id: UIElementId) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, item: UIHierarchyItem) => void
  onDragStart: (event: ReactDragEvent<HTMLButtonElement>, id: UIElementId) => void
  onDragOver: (event: ReactDragEvent<HTMLDivElement>, id: UIElementId) => void
  onDrop: (event: ReactDragEvent<HTMLDivElement>, id: UIElementId) => void
}) {
  const isSelected = selected.includes(item.id)
  const isExpanded = expanded.has(item.id)
  const element = elements.get(item.id)!
  const locked = uiAuthoringSession.isEditorLocked(item.id)
  const marker = dropIndicator?.targetId === item.id ? dropIndicator : null
  return (
    <li role="none">
      <div
        className={`haku-ui-editor__tree-row${marker?.valid ? ' haku-ui-editor__tree-row--drop-valid' : ''}`}
        data-haku-ui-tree-row={item.id}
        data-haku-ui-locked={locked ? 'true' : 'false'}
        data-haku-ui-drop-position={marker?.position}
        onDragOver={(event) => onDragOver(event, item.id)}
        onDrop={(event) => onDrop(event, item.id)}
      >
        {item.children.length > 0 ? (
          <button
            type="button"
            className="haku-ui-editor__tree-disclosure"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.name}`}
            aria-expanded={isExpanded}
            onClick={() => onToggle(item.id)}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="haku-ui-editor__tree-disclosure" aria-hidden="true" />
        )}
        <span className="haku-ui-editor__tree-icon" aria-hidden="true">
          {layerIcon(item.type)}
        </span>
        {renamingId === item.id ? (
          <input
            autoFocus
            className="haku-ui-editor__tree-rename"
            aria-label={`Rename ${item.name}`}
            defaultValue={item.name}
            onBlur={(event) => onCommitRename(item.id, event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onCommitRename(item.id, event.currentTarget.value)
              if (event.key === 'Escape') onCancelRename()
            }}
          />
        ) : (
          <button
            type="button"
            role="treeitem"
            draggable={item.id !== rootId && !locked}
            aria-selected={isSelected}
            aria-expanded={item.children.length > 0 ? isExpanded : undefined}
            data-haku-ui-tree-item={item.id}
            data-haku-ui-selected={isSelected ? 'true' : 'false'}
            className={`haku-ui-editor__tree-item${isSelected ? ' haku-ui-editor__tree-item--selected' : ''}`}
            onClick={(event) => onSelect(item.id, event.shiftKey)}
            onDoubleClick={() => onBeginRename(item.id)}
            onKeyDown={(event) => onKeyDown(event, item)}
            onDragStart={(event) => onDragStart(event, item.id)}
          >
            <span>{item.name}</span>
          </button>
        )}
        <div className="haku-ui-editor__tree-actions">
          <button
            type="button"
            aria-label={`Rename ${item.name}`}
            onClick={() => onBeginRename(item.id)}
          >
            ✎
          </button>
          <button
            type="button"
            aria-label={`${element.visible ? 'Hide' : 'Show'} ${item.name}`}
            onClick={() => onVisible(item.id, !element.visible)}
          >
            {element.visible ? '◉' : '○'}
          </button>
          <button
            type="button"
            aria-label={`${locked ? 'Unlock' : 'Lock'} ${item.name}`}
            onClick={() => onLock(item.id, !locked)}
          >
            {locked ? '▣' : '□'}
          </button>
          <button
            type="button"
            aria-label={`Duplicate ${item.name}`}
            disabled={item.id === rootId || locked}
            onClick={() => onDuplicate(item.id)}
          >
            ⧉
          </button>
          <button
            type="button"
            aria-label={`Delete ${item.name}`}
            disabled={item.id === rootId || locked}
            onClick={() => onDelete(item.id)}
          >
            ×
          </button>
        </div>
      </div>
      {item.children.length > 0 && isExpanded && (
        <ul role="group">
          {item.children.map((child) => (
            <HierarchyNode
              key={child.id}
              item={child}
              rootId={rootId}
              elements={elements}
              selected={selected}
              expanded={expanded}
              renamingId={renamingId}
              dropIndicator={dropIndicator}
              onSelect={onSelect}
              onToggle={onToggle}
              onBeginRename={onBeginRename}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onVisible={onVisible}
              onLock={onLock}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onKeyDown={onKeyDown}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
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
  const numericWidth =
    element.sizing.width.mode === 'fixed' && element.sizing.width.unit === 'px'
      ? element.sizing.width.value
      : 0
  const numericHeight =
    element.sizing.height.mode === 'fixed' && element.sizing.height.unit === 'px'
      ? element.sizing.height.value
      : 0

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
        onChange={(width) =>
          update({
            sizing: { ...element.sizing, width: { mode: 'fixed', value: width, unit: 'px' } },
          })
        }
      />
      <NumberField
        label="Height (px)"
        value={numericHeight}
        min={0}
        step={1}
        onChange={(height) =>
          update({
            sizing: { ...element.sizing, height: { mode: 'fixed', value: height, unit: 'px' } },
          })
        }
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
  const instanceRef = useRef<UIDocumentInstance | null>(null)
  const canvasHost = useRef<HTMLDivElement>(null)
  const canvasSize = useRef<UICanvasSize>({ width: 0, height: 0 })
  const canvasViewRef = useRef<UICanvasView>({ scale: 1, x: 0, y: 0 })
  const gestureRef = useRef<UIGesture | null>(null)
  const hierarchyDragRef = useRef<readonly UIElementId[]>([])
  const paletteDragRef = useRef<UICreatableType | null>(null)
  const spacePressed = useRef(false)
  const [status, setStatus] = useState('Ready')
  const [previewTheme, setPreviewTheme] = useState<string>('')
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [elementBounds, setElementBounds] = useState<ReadonlyMap<UIElementId, UIRect>>(new Map())
  const [gestureRects, setGestureRects] = useState<ReadonlyMap<UIElementId, UIRect>>(new Map())
  const [guides, setGuides] = useState<readonly UISnapCandidate[]>([])
  const [canvasCursor, setCanvasCursor] = useState('default')
  const [expandedLayers, setExpandedLayers] = useState<Set<UIElementId>>(
    () =>
      new Set(
        uiAuthoringSession.asset?.elements
          .filter((element) => 'children' in element)
          .map((element) => element.id) ?? [],
      ),
  )
  const [renamingId, setRenamingId] = useState<UIElementId | null>(null)
  const [dropIndicator, setDropIndicator] = useState<UIDropIndicator | null>(null)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [texturePickerOpen, setTexturePickerOpen] = useState(false)
  const [pendingImageCreation, setPendingImageCreation] = useState<{
    readonly pointerFrameId?: UIElementId
    readonly insertionIndex?: number
    readonly point?: { readonly x: number; readonly y: number }
  } | null>(null)
  const [canvasView, setCanvasView] = useState<UICanvasView & { mode: 'fit' | 'manual' }>({
    mode: 'fit',
    scale: 1,
    x: 0,
    y: 0,
  })

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
  const elements = useMemo(
    () => new Map(asset?.elements.map((element) => [element.id, element]) ?? []),
    [asset],
  )
  const selectedIds = uiAuthoringSession.selectedElementIds
  const viewport = uiAuthoringSession.viewport
  const previewMode = uiAuthoringSession.previewMode
  const textures = projectService.listTextureAssets()
  const palette = UI_PALETTE.filter((entry) =>
    `${entry.label} ${entry.type}`.toLowerCase().includes(paletteQuery.trim().toLowerCase()),
  )

  const runHierarchyAction = useCallback((action: () => void, success: string) => {
    try {
      action()
      setStatus(success)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const hierarchyParents = useMemo(() => (asset ? elementParents(asset) : new Map()), [asset])

  const focusLayer = useCallback((id: UIElementId) => {
    document.querySelector<HTMLElement>(`[data-haku-ui-tree-item="${id}"]`)?.focus()
  }, [])

  const handleLayerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, item: UIHierarchyItem) => {
      if (!asset) return
      const visible = flattenHierarchy(hierarchy, expandedLayers)
      const index = visible.findIndex((candidate) => candidate.id === item.id)
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        const parentId = hierarchyParents.get(item.id)
        const parent = parentId ? elements.get(parentId as UIElementId) : undefined
        if (!parent || !('children' in parent)) return
        const siblingIndex = parent.children.indexOf(item.id)
        const targetIndex = siblingIndex + (event.key === 'ArrowUp' ? -1 : 1)
        const targetId = parent.children[targetIndex]
        if (!targetId) {
          setStatus('Layer is already at the hierarchy boundary')
          return
        }
        runHierarchyAction(
          () =>
            uiAuthoringSession.moveElements(
              uiAuthoringSession.selectedElementIds.includes(item.id)
                ? uiAuthoringSession.selectedElementIds
                : [item.id],
              {
                targetId,
                position: event.key === 'ArrowUp' ? 'before' : 'after',
              },
              elementBounds,
            ),
          `Moved ${item.name}`,
        )
        requestAnimationFrame(() => focusLayer(item.id))
        return
      }
      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault()
        const parentId = hierarchyParents.get(item.id)
        const parent = parentId ? elements.get(parentId as UIElementId) : undefined
        const indexInParent = parent && 'children' in parent ? parent.children.indexOf(item.id) : -1
        const previousId =
          parent && 'children' in parent ? parent.children[indexInParent - 1] : undefined
        if (!previousId) {
          setStatus('No previous container is available for nesting')
          return
        }
        runHierarchyAction(
          () =>
            uiAuthoringSession.moveElements(
              [item.id],
              { targetId: previousId, position: 'inside' },
              elementBounds,
            ),
          `Nested ${item.name}`,
        )
        return
      }
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        const parentId = hierarchyParents.get(item.id)
        if (!parentId || parentId === asset.root) {
          setStatus('Layer cannot be moved outside the root')
          return
        }
        runHierarchyAction(
          () =>
            uiAuthoringSession.moveElements(
              [item.id],
              { targetId: parentId as UIElementId, position: 'after' },
              elementBounds,
            ),
          `Moved ${item.name} out one level`,
        )
        return
      }
      if (event.key === 'ArrowDown' && visible[index + 1]) {
        event.preventDefault()
        focusLayer(visible[index + 1]!.id)
      } else if (event.key === 'ArrowUp' && visible[index - 1]) {
        event.preventDefault()
        focusLayer(visible[index - 1]!.id)
      } else if (event.key === 'ArrowRight' && item.children.length > 0) {
        event.preventDefault()
        if (!expandedLayers.has(item.id)) {
          setExpandedLayers((current) => new Set(current).add(item.id))
        } else {
          requestAnimationFrame(() => focusLayer(item.children[0]!.id))
        }
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (expandedLayers.has(item.id) && item.children.length > 0) {
          setExpandedLayers((current) => {
            const next = new Set(current)
            next.delete(item.id)
            return next
          })
        } else {
          const parentId = hierarchyParents.get(item.id)
          if (parentId) focusLayer(parentId as UIElementId)
        }
      } else if (event.key === 'F2') {
        event.preventDefault()
        setRenamingId(item.id)
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        runHierarchyAction(
          () => uiAuthoringSession.duplicateElements([item.id]),
          `Duplicated ${item.name}`,
        )
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        runHierarchyAction(
          () => uiAuthoringSession.removeElements([item.id]),
          `Deleted ${item.name}`,
        )
      }
    },
    [
      asset,
      elementBounds,
      elements,
      expandedLayers,
      focusLayer,
      hierarchy,
      hierarchyParents,
      runHierarchyAction,
    ],
  )

  const dropPosition = (event: ReactDragEvent<HTMLElement>, item: UIHierarchyItem) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio =
      rect.height > 0 ? (event.clientY - rect.top) / rect.height : event.clientY <= rect.top ? 0 : 1
    if (ratio < 0.3) return 'before' as const
    if (ratio > 0.7) return 'after' as const
    return item.children.length > 0 ? ('inside' as const) : ('after' as const)
  }

  const handleLayerDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>, targetId: UIElementId) => {
      const ids = hierarchyDragRef.current
      if (!asset || ids.length === 0) return
      event.preventDefault()
      const item = flattenHierarchy(
        hierarchy,
        new Set(asset.elements.map((element) => element.id)),
      ).find((candidate) => candidate.id === targetId)
      if (!item) return
      const position = dropPosition(event, item)
      let valid = true
      try {
        moveUIElements(
          asset,
          ids,
          { targetId, position },
          {
            lockedIds: uiAuthoringSession.editorLockedElementIds,
            bounds: elementBounds,
          },
        )
      } catch {
        valid = false
      }
      event.dataTransfer.dropEffect = valid ? 'move' : 'none'
      setDropIndicator({ targetId, position, valid })
    },
    [asset, elementBounds, hierarchy],
  )

  const handleLayerDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>, targetId: UIElementId) => {
      event.preventDefault()
      const ids = hierarchyDragRef.current
      const position = dropIndicator?.targetId === targetId ? dropIndicator.position : 'inside'
      runHierarchyAction(
        () => uiAuthoringSession.moveElements(ids, { targetId, position }, elementBounds),
        `Moved ${ids.length} layer${ids.length === 1 ? '' : 's'}`,
      )
      hierarchyDragRef.current = []
      setDropIndicator(null)
    },
    [dropIndicator, elementBounds, runHierarchyAction],
  )

  canvasViewRef.current = canvasView

  const fitRoot = useCallback(() => {
    const host = canvasHost.current
    const size = host ? { width: host.clientWidth, height: host.clientHeight } : canvasSize.current
    if (size.width <= 0 || size.height <= 0) {
      setCanvasView((current) => ({ ...current, mode: 'fit' }))
      return
    }
    canvasSize.current = size
    setCanvasView({
      mode: 'fit',
      ...fitCanvasView(size, { width: viewport.width, height: viewport.height }),
    })
  }, [viewport.height, viewport.width])

  const setZoom = useCallback(
    (scale: number, anchor?: { readonly x: number; readonly y: number }) => {
      const size = canvasSize.current
      setCanvasView((current) => ({
        mode: 'manual',
        ...setCanvasZoom(current, scale, anchor ?? { x: size.width / 2, y: size.height / 2 }),
      }))
    },
    [],
  )

  const fitSelection = useCallback(() => {
    const bounds = unionRects(
      uiAuthoringSession.selectedElementIds.flatMap((id) => {
        const rect = elementBounds.get(id)
        return rect ? [rect] : []
      }),
    )
    if (!bounds || canvasSize.current.width <= 0 || canvasSize.current.height <= 0) return
    setCanvasView({ mode: 'manual', ...fitCanvasBounds(canvasSize.current, bounds) })
  }, [elementBounds])

  useEffect(() => {
    const host = canvasHost.current
    if (!host) return
    let previous = canvasSize.current
    const updateSize = (next: UICanvasSize) => {
      if (next.width <= 0 || next.height <= 0) return
      canvasSize.current = next
      setCanvasView((current) => ({
        mode: current.mode,
        ...(current.mode === 'fit'
          ? fitCanvasView(next, { width: viewport.width, height: viewport.height })
          : resizeCanvasView(current, previous, next)),
      }))
      previous = next
    }
    const measure = () => updateSize({ width: host.clientWidth, height: host.clientHeight })
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', measure)
        window.visualViewport?.removeEventListener('resize', measure)
      }
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) updateSize({ width: rect.width, height: rect.height })
    })
    observer.observe(host)
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [viewport.height, viewport.width])

  useEffect(() => fitRoot(), [fitRoot])
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
    let frame = 0
    let disposed = false
    try {
      instance.mount(host)
      instanceRef.current = instance
      const measure = () => {
        if (disposed) return
        const scale = canvasViewRef.current.scale
        const hostRect = host.getBoundingClientRect()
        const next = fallbackElementBounds(asset, viewport)
        for (const element of asset.elements) {
          const node = instance.getElement(element.id)
          if (!node) continue
          const rect = node.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            next.set(element.id, {
              x: (rect.left - hostRect.left) / scale,
              y: (rect.top - hostRect.top) / scale,
              width: rect.width / scale,
              height: rect.height / scale,
            })
          }
        }
        setElementBounds(next)
      }
      measure()
      frame = requestAnimationFrame(measure)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Preview failed')
    }
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      if (instanceRef.current === instance) instanceRef.current = null
      unsubscribe()
      instance.destroy()
    }
  }, [asset, previewTheme, viewport.height, viewport.width])

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance || !asset) return
    for (const element of asset.elements) {
      const node = instance.getElement(element.id)
      if (node) delete node.dataset.hakuUiSelected
    }
    if (previewMode !== 'edit') return
    for (const id of selectedIds) {
      const node = instance.getElement(id)
      if (node) node.dataset.hakuUiSelected = 'true'
    }
  }, [asset, previewMode, selectedIds])

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

  const restoreGestureStyles = useCallback((gesture: UIGesture | null) => {
    if (!gesture || gesture.kind === 'pan') return
    const instance = instanceRef.current
    if (!instance) return
    for (const [id, style] of gesture.styles) {
      const node = instance.getElement(id)
      if (node) restoreInlineStyle(node, style)
    }
  }, [])

  const cancelGesture = useCallback(() => {
    restoreGestureStyles(gestureRef.current)
    gestureRef.current = null
    setGestureRects(new Map())
    setGuides([])
    setCanvasCursor(spacePressed.current ? 'grab' : 'default')
  }, [restoreGestureStyles])

  const hitIdsAt = useCallback(
    (clientX: number, clientY: number, fallbackId?: string): readonly string[] => {
      if (!asset) return []
      const canvasRect = canvasHost.current?.getBoundingClientRect()
      const point = canvasPointToDocument(
        {
          x: clientX - (canvasRect?.left ?? 0),
          y: clientY - (canvasRect?.top ?? 0),
        },
        canvasViewRef.current,
      )
      const parents = elementParents(asset)
      const depth = (id: string) => {
        let value = 0
        let current = parents.get(id)
        while (current) {
          value += 1
          current = parents.get(current)
        }
        return value
      }
      const hits = asset.elements.flatMap((element, paintOrder) => {
        const rect = elementBounds.get(element.id)
        const contains =
          rect &&
          point.x >= rect.x &&
          point.x <= rect.x + rect.width &&
          point.y >= rect.y &&
          point.y <= rect.y + rect.height
        return contains || element.id === fallbackId
          ? [
              {
                id: element.id,
                paintOrder,
                depth: depth(element.id),
                hidden: !element.visible,
                editorLocked: uiAuthoringSession.isEditorLocked(element.id),
                disabled: !element.enabled,
              },
            ]
          : []
      })
      return orderCanvasHits(hits)
    },
    [asset, elementBounds],
  )

  const snapCandidates = useCallback(
    (id: UIElementId, rect: UIRect): readonly UISnapCandidate[] => {
      if (!asset) return []
      const parents = elementParents(asset)
      const parentId = parents.get(id)
      const parentRect = parentId ? elementBounds.get(parentId as UIElementId) : undefined
      if (!parentId || !parentRect) return []
      const candidates: UISnapCandidate[] = [
        { axis: 'x', delta: parentRect.x - rect.x, kind: 'parent-edge', guide: parentRect.x },
        {
          axis: 'x',
          delta: parentRect.x + parentRect.width - (rect.x + rect.width),
          kind: 'parent-edge',
          guide: parentRect.x + parentRect.width,
        },
        { axis: 'y', delta: parentRect.y - rect.y, kind: 'parent-edge', guide: parentRect.y },
        {
          axis: 'y',
          delta: parentRect.y + parentRect.height - (rect.y + rect.height),
          kind: 'parent-edge',
          guide: parentRect.y + parentRect.height,
        },
        {
          axis: 'x',
          delta: parentRect.x + parentRect.width / 2 - (rect.x + rect.width / 2),
          kind: 'center',
          guide: parentRect.x + parentRect.width / 2,
        },
        {
          axis: 'y',
          delta: parentRect.y + parentRect.height / 2 - (rect.y + rect.height / 2),
          kind: 'center',
          guide: parentRect.y + parentRect.height / 2,
        },
      ]
      const parent = asset.elements.find((element) => element.id === parentId)
      if (parent && 'layout' in parent) {
        const padding = parent.layout.padding
        candidates.push(
          {
            axis: 'x',
            delta: parentRect.x + padding.left - rect.x,
            kind: 'parent-padding',
            guide: parentRect.x + padding.left,
          },
          {
            axis: 'y',
            delta: parentRect.y + padding.top - rect.y,
            kind: 'parent-padding',
            guide: parentRect.y + padding.top,
          },
        )
      }
      for (const peer of asset.elements) {
        if (peer.id === id || selectedIds.includes(peer.id) || parents.get(peer.id) !== parentId)
          continue
        const peerRect = elementBounds.get(peer.id)
        if (!peerRect) continue
        const alignments = [
          [peerRect.x - rect.x, peerRect.x],
          [peerRect.x + peerRect.width - (rect.x + rect.width), peerRect.x + peerRect.width],
        ] as const
        for (const [delta, guide] of alignments)
          candidates.push({ axis: 'x', delta, kind: 'peer-edge', guide })
        candidates.push({
          axis: 'x',
          delta: peerRect.x + peerRect.width / 2 - (rect.x + rect.width / 2),
          kind: 'center',
          guide: peerRect.x + peerRect.width / 2,
        })
        const vertical = [
          [peerRect.y - rect.y, peerRect.y],
          [peerRect.y + peerRect.height - (rect.y + rect.height), peerRect.y + peerRect.height],
        ] as const
        for (const [delta, guide] of vertical)
          candidates.push({ axis: 'y', delta, kind: 'peer-edge', guide })
        candidates.push({
          axis: 'y',
          delta: peerRect.y + peerRect.height / 2 - (rect.y + rect.height / 2),
          kind: 'center',
          guide: peerRect.y + peerRect.height / 2,
        })
      }
      const peers = asset.elements
        .filter(
          (element) =>
            element.id !== id &&
            !selectedIds.includes(element.id) &&
            parents.get(element.id) === parentId,
        )
        .flatMap((element) => {
          const peerRect = elementBounds.get(element.id)
          return peerRect ? [peerRect] : []
        })
      for (const axis of ['x', 'y'] as const) {
        const start = axis
        const size = axis === 'x' ? 'width' : 'height'
        const sorted = [...peers].sort((a, b) => a[start] - b[start])
        for (let index = 1; index < sorted.length; index += 1) {
          const before = sorted[index - 1]!
          const after = sorted[index]!
          const gap = after[start] - (before[start] + before[size])
          const target = before[start] + before[size] + gap
          candidates.push({
            axis,
            delta: target - rect[start],
            kind: 'equal-gap',
            guide: target,
          })
        }
      }
      return candidates
    },
    [asset, elementBounds, selectedIds],
  )

  const beginPointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const handle = target.dataset.hakuUiResizeHandle as UIResizeHandle | undefined
    const targetId = target.closest<HTMLElement>('[data-haku-ui-hit-target]')?.dataset
      .hakuUiHitTarget
    const start = { x: event.clientX, y: event.clientY }
    if (event.button === 1 || (event.button === 0 && spacePressed.current)) {
      event.preventDefault()
      gestureRef.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        start,
        view: canvasViewRef.current,
      }
      setCanvasCursor('grabbing')
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    if (previewMode !== 'edit' || event.button !== 0 || !asset || (!targetId && !handle)) return
    event.preventDefault()
    const hits = hitIdsAt(event.clientX, event.clientY, targetId)
    const cycle = event.altKey || event.metaKey || event.ctrlKey
    const id = (
      cycle ? cycleCanvasHit(hits, uiAuthoringSession.selectedElementId) : (targetId ?? hits[0])
    ) as UIElementId | null
    if (!id) return
    if (event.shiftKey) uiAuthoringSession.toggleSelection(id)
    else if (!handle && !selectedIds.includes(id)) uiAuthoringSession.select(id)
    const ids = handle ? selectedIds : event.shiftKey ? uiAuthoringSession.selectedElementIds : [id]
    const editableIds = ids.filter((selectedId) => {
      const element = asset.elements.find((candidate) => candidate.id === selectedId)
      return (
        element?.placement.positioning === 'free' || element?.placement.positioning === 'absolute'
      )
    })
    if (editableIds.length === 0 || event.shiftKey) return
    const before = new Map<UIElementId, UIRect>()
    const styles = new Map<UIElementId, string>()
    for (const selectedId of editableIds) {
      const rect = elementBounds.get(selectedId)
      const node = instanceRef.current?.getElement(selectedId)
      if (rect) before.set(selectedId, rect)
      if (node) styles.set(selectedId, node.getAttribute('style') ?? '')
    }
    if (before.size === 0) return
    gestureRef.current = {
      kind: handle ? 'resize' : 'move',
      pointerId: event.pointerId,
      start,
      ids: editableIds,
      before,
      styles,
      ...(handle ? { handle } : {}),
    }
    setCanvasCursor(handle ? `${handle}-resize` : 'move')
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const enterNestedFrame = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (previewMode !== 'edit' || !asset) return
    const targetId = (event.target as HTMLElement).closest<HTMLElement>('[data-haku-ui-hit-target]')
      ?.dataset.hakuUiHitTarget
    if (!targetId) return
    const target = asset.elements.find((element) => element.id === targetId)
    if (!target || !('children' in target)) return
    const descendants = new Set<string>()
    const visit = (id: string) => {
      const element = asset.elements.find((candidate) => candidate.id === id)
      if (!element) return
      descendants.add(id)
      if ('children' in element) for (const child of element.children) visit(child)
    }
    for (const child of target.children) visit(child)
    const nested = hitIdsAt(event.clientX, event.clientY).find((id) => descendants.has(id))
    if (nested) uiAuthoringSession.select(nested)
  }

  const updatePointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const dxCanvas = event.clientX - gesture.start.x
    const dyCanvas = event.clientY - gesture.start.y
    if (gesture.kind === 'pan') {
      setCanvasView({
        mode: 'manual',
        ...panCanvasView(gesture.view, { x: dxCanvas, y: dyCanvas }),
      })
      return
    }
    const dx = dxCanvas / canvasViewRef.current.scale
    const dy = dyCanvas / canvasViewRef.current.scale
    const primaryId = gesture.ids.at(-1)
    const primaryBefore = primaryId ? gesture.before.get(primaryId) : undefined
    if (!primaryId || !primaryBefore || !asset) return
    let primary =
      gesture.kind === 'resize' && gesture.handle
        ? resizeRect(primaryBefore, gesture.handle, dx, dy)
        : { ...primaryBefore, x: primaryBefore.x + dx, y: primaryBefore.y + dy }
    const parentId = elementParents(asset).get(primaryId)
    const parentRect = parentId ? elementBounds.get(parentId as UIElementId) : undefined
    const primaryElement = asset.elements.find((element) => element.id === primaryId)
    if (parentRect && primaryElement) {
      const local = clampUIRect(
        { ...primary, x: primary.x - parentRect.x, y: primary.y - parentRect.y },
        parentRect,
        primaryElement.sizing,
      )
      primary = { ...local, x: local.x + parentRect.x, y: local.y + parentRect.y }
    }
    const unsnapped = primary
    const snapped = snapUIRect(
      primary,
      snapCandidates(primaryId, primary),
      6 / canvasViewRef.current.scale,
      event.metaKey || event.ctrlKey,
    )
    primary = snapped.rect
    if (gesture.kind === 'resize' && gesture.handle) {
      const xDelta = snapped.guides.find((guide) => guide.axis === 'x')?.delta ?? 0
      const yDelta = snapped.guides.find((guide) => guide.axis === 'y')?.delta ?? 0
      primary = {
        x: gesture.handle.includes('w') ? unsnapped.x + xDelta : unsnapped.x,
        y: gesture.handle.includes('n') ? unsnapped.y + yDelta : unsnapped.y,
        width:
          unsnapped.width +
          (gesture.handle.includes('e') ? xDelta : gesture.handle.includes('w') ? -xDelta : 0),
        height:
          unsnapped.height +
          (gesture.handle.includes('s') ? yDelta : gesture.handle.includes('n') ? -yDelta : 0),
      }
    }
    const actualDx = primary.x - primaryBefore.x
    const actualDy = primary.y - primaryBefore.y
    const next = new Map<UIElementId, UIRect>()
    for (const id of gesture.ids) {
      const before = gesture.before.get(id)
      if (!before) continue
      const rect =
        id === primaryId ? primary : { ...before, x: before.x + actualDx, y: before.y + actualDy }
      next.set(id, rect)
      const node = instanceRef.current?.getElement(id)
      if (!node) continue
      const original = gesture.styles.get(id) ?? ''
      restoreInlineStyle(node, original)
      if (gesture.kind === 'move' || rect.x !== before.x || rect.y !== before.y) {
        node.style.transform = `translate(${rect.x - before.x}px, ${rect.y - before.y}px)`
      }
      if (gesture.kind === 'resize') {
        node.style.width = `${rect.width}px`
        node.style.height = `${rect.height}px`
      }
    }
    setGestureRects(next)
    setGuides(snapped.guides)
  }

  const commitPointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (gesture.kind === 'pan') {
      setCanvasCursor(spacePressed.current ? 'grab' : 'default')
      return
    }
    if (!asset || gestureRects.size === 0) {
      restoreGestureStyles(gesture)
      setCanvasCursor('default')
      return
    }
    const elements = asset.elements.map((element) => {
      const rect = gestureRects.get(element.id)
      const before = gesture.before.get(element.id)
      if (!rect || !before) return element
      const dx = rect.x - before.x
      const dy = rect.y - before.y
      let placement = element.placement
      if (placement.positioning === 'free') {
        placement = { ...placement, x: placement.x + dx, y: placement.y + dy }
      } else if (placement.positioning === 'absolute') {
        placement = {
          ...placement,
          ...(placement.left !== undefined ? { left: placement.left + dx } : {}),
          ...(placement.right !== undefined ? { right: placement.right - dx } : {}),
          ...(placement.top !== undefined ? { top: placement.top + dy } : {}),
          ...(placement.bottom !== undefined ? { bottom: placement.bottom - dy } : {}),
        }
      }
      let sizing = element.sizing
      if (gesture.kind === 'resize' && gesture.handle) {
        if (gesture.handle.includes('e') || gesture.handle.includes('w'))
          sizing = resizeDimensionIntent(sizing, 'width', rect.width)
        if (gesture.handle.includes('n') || gesture.handle.includes('s'))
          sizing = resizeDimensionIntent(sizing, 'height', rect.height)
      }
      return { ...element, placement, sizing }
    })
    setGestureRects(new Map())
    setGuides([])
    setCanvasCursor('default')
    uiAuthoringSession.replaceAsset({ ...asset, elements }, gesture.ids)
  }

  useEffect(() => {
    const host = canvasHost.current
    if (!host) return
    const wheel = (event: WheelEvent) => {
      if (previewMode !== 'edit') return
      event.preventDefault()
      const rect = host.getBoundingClientRect()
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      setZoom(canvasViewRef.current.scale * Math.exp(-event.deltaY * 0.002), anchor)
    }
    host.addEventListener('wheel', wheel, { passive: false })
    return () => host.removeEventListener('wheel', wheel)
  }, [previewMode, setZoom])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (gestureRef.current) cancelGesture()
        else if (previewMode === 'preview') uiAuthoringSession.setPreviewMode('edit')
        return
      }
      if (previewMode !== 'edit') return
      const target = event.target
      if (
        target instanceof Element &&
        target.matches('input, textarea, select, [contenteditable="true"]')
      )
        return
      if (event.code === 'Space') {
        event.preventDefault()
        spacePressed.current = true
        if (!gestureRef.current) setCanvasCursor('grab')
        return
      }
      if (event.code === 'Digit1' || event.key === '1') {
        event.preventDefault()
        if (event.shiftKey) fitRoot()
        else setZoom(1)
        return
      }
      if ((event.code === 'Digit2' || event.key === '2') && event.shiftKey) {
        event.preventDefault()
        fitSelection()
        return
      }
      if (
        !asset ||
        !event.key.startsWith('Arrow') ||
        (target instanceof Element && target.closest('[data-haku-ui-tree-item]'))
      )
        return
      const delta = event.shiftKey ? 10 : 1
      const movement = {
        x: event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0,
        y: event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0,
      }
      if (movement.x === 0 && movement.y === 0) return
      const ids = uiAuthoringSession.selectedElementIds
      const next = asset.elements.map((element) => {
        if (!ids.includes(element.id)) return element
        const placement = element.placement
        if (placement.positioning === 'free') {
          return {
            ...element,
            placement: {
              ...placement,
              x: placement.x + movement.x,
              y: placement.y + movement.y,
            },
          }
        }
        if (placement.positioning === 'absolute') {
          return {
            ...element,
            placement: {
              ...placement,
              ...(placement.left !== undefined ? { left: placement.left + movement.x } : {}),
              ...(placement.right !== undefined ? { right: placement.right - movement.x } : {}),
              ...(placement.top !== undefined ? { top: placement.top + movement.y } : {}),
              ...(placement.bottom !== undefined ? { bottom: placement.bottom - movement.y } : {}),
            },
          }
        }
        return element
      })
      if (next.some((element, index) => element !== asset.elements[index])) {
        event.preventDefault()
        uiAuthoringSession.replaceAsset({ ...asset, elements: next }, ids)
      }
    }
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      spacePressed.current = false
      if (!gestureRef.current) setCanvasCursor('default')
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [asset, cancelGesture, fitRoot, fitSelection, previewMode, setZoom])

  if (!asset) {
    return <div className="haku-ui-editor haku-ui-editor--empty">No UI document open</div>
  }

  const createElement = (
    type: UICreatableType,
    options: {
      readonly pointerFrameId?: UIElementId
      readonly insertionIndex?: number
      readonly point?: { readonly x: number; readonly y: number }
    } = {},
  ) => {
    if (type === 'image') {
      setPendingImageCreation(options)
      setTexturePickerOpen(true)
      setStatus(
        textures.length === 0
          ? 'No project texture assets are available'
          : 'Choose a project texture',
      )
      return
    }
    runHierarchyAction(
      () => uiAuthoringSession.createElement(type, options),
      `Created ${UI_PALETTE.find((entry) => entry.type === type)?.label ?? type}`,
    )
  }

  const canvasCreationContext = (clientX: number, clientY: number) => {
    const canvasRect = canvasHost.current?.getBoundingClientRect()
    const point = canvasPointToDocument(
      { x: clientX - (canvasRect?.left ?? 0), y: clientY - (canvasRect?.top ?? 0) },
      canvasViewRef.current,
    )
    const pointerFrameId = hitIdsAt(clientX, clientY).find((id) => {
      const element = elements.get(id as UIElementId)
      return element?.type === 'frame' && !uiAuthoringSession.isEditorLocked(element.id)
    }) as UIElementId | undefined
    const target = resolveUICreationTarget(asset, {
      ...(pointerFrameId ? { pointerFrameId } : {}),
      selectedId: uiAuthoringSession.selectedElementId,
      lockedIds: uiAuthoringSession.editorLockedElementIds,
    })
    const parent = elements.get(target.parentId)
    const parentBounds = elementBounds.get(target.parentId)
    let insertionIndex = target.index
    if (parent && 'children' in parent && parent.layout.mode !== 'free') {
      const axis = parent.layout.mode === 'horizontal' ? 'x' : 'y'
      insertionIndex = parent.children.findIndex((child) => {
        const bounds = elementBounds.get(child)
        if (!bounds) return false
        const midpoint = bounds[axis] + (axis === 'x' ? bounds.width : bounds.height) / 2
        return point[axis] < midpoint
      })
      if (insertionIndex < 0) insertionIndex = parent.children.length
    }
    return {
      parentId: target.parentId,
      ...(pointerFrameId ? { pointerFrameId } : {}),
      insertionIndex,
      point: {
        x: point.x - (parentBounds?.x ?? 0),
        y: point.y - (parentBounds?.y ?? 0),
      },
    }
  }

  const handleCanvasDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (paletteDragRef.current || hierarchyDragRef.current.length > 0) {
      event.preventDefault()
      event.dataTransfer.dropEffect = paletteDragRef.current ? 'copy' : 'move'
    }
  }

  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    try {
      const context = canvasCreationContext(event.clientX, event.clientY)
      if (paletteDragRef.current) {
        createElement(paletteDragRef.current, context)
      } else if (hierarchyDragRef.current.length > 0) {
        const parent = elements.get(context.parentId)
        const targetId =
          parent && 'children' in parent ? parent.children[context.insertionIndex] : undefined
        uiAuthoringSession.moveElements(
          hierarchyDragRef.current,
          targetId
            ? { targetId, position: 'before' }
            : { targetId: context.parentId, position: 'inside' },
          elementBounds,
        )
        setStatus(
          `Moved ${hierarchyDragRef.current.length} layer${hierarchyDragRef.current.length === 1 ? '' : 's'} on canvas`,
        )
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      paletteDragRef.current = null
      hierarchyDragRef.current = []
      setDropIndicator(null)
    }
  }

  return (
    <section
      className="haku-ui-editor"
      aria-label="UI document editor"
      data-haku-ui-workspace="true"
      data-haku-ui-document-path={uiAuthoringSession.path ?? undefined}
      data-haku-ui-selected-id={uiAuthoringSession.selectedElementId ?? undefined}
      data-haku-ui-selected-ids={selectedIds.join(',')}
    >
      <div className="haku-ui-editor__toolbar">
        <button type="button" onClick={() => void createDocument()}>
          New
        </button>
        <button type="button" onClick={() => void openDocument()}>
          Open
        </button>
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
        <button
          type="button"
          disabled={!uiCommandBus.canUndo()}
          onClick={() => uiCommandBus.undo()}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!uiCommandBus.canRedo()}
          onClick={() => uiCommandBus.redo()}
        >
          Redo
        </button>
        <label>
          Size
          <select
            aria-label="UI preview viewport"
            value={viewport.id}
            onChange={(event) => {
              const id = event.target.value
              uiAuthoringSession.setViewport(
                id === 'custom' ? 'custom' : (id as UIDesktopViewportId),
              )
            }}
          >
            {Object.values(UI_DESKTOP_VIEWPORTS).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        {viewport.id === 'custom' && (
          <div className="haku-ui-editor__custom-size">
            <label>
              W
              <input
                type="number"
                min={1}
                aria-label="Custom preview width"
                value={viewport.width}
                onChange={(event) => {
                  const width = event.target.valueAsNumber
                  if (Number.isFinite(width) && width > 0) {
                    uiAuthoringSession.setCustomViewport(width, viewport.height)
                  }
                }}
              />
            </label>
            <span aria-hidden="true">×</span>
            <label>
              H
              <input
                type="number"
                min={1}
                aria-label="Custom preview height"
                value={viewport.height}
                onChange={(event) => {
                  const height = event.target.valueAsNumber
                  if (Number.isFinite(height) && height > 0) {
                    uiAuthoringSession.setCustomViewport(viewport.width, height)
                  }
                }}
              />
            </label>
          </div>
        )}
        <div className="haku-ui-editor__mode" aria-label="Canvas mode">
          <button
            type="button"
            aria-pressed={previewMode === 'edit'}
            onClick={() => uiAuthoringSession.setPreviewMode('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            aria-pressed={previewMode === 'preview'}
            onClick={() => uiAuthoringSession.setPreviewMode('preview')}
          >
            Preview
          </button>
        </div>
        <label>
          Zoom
          <input
            className="haku-ui-editor__zoom"
            type="number"
            min={10}
            max={800}
            step={10}
            aria-label="Canvas zoom"
            value={Math.round(canvasView.scale * 100)}
            onChange={(event) => {
              if (Number.isFinite(event.target.valueAsNumber)) {
                setZoom(event.target.valueAsNumber / 100)
              }
            }}
          />
          %
        </label>
        <button type="button" onClick={() => setZoom(1)}>
          100%
        </button>
        <button type="button" onClick={fitRoot}>
          Fit root
        </button>
        <button type="button" onClick={fitSelection} disabled={selectedIds.length === 0}>
          Fit selection
        </button>
        <button
          type="button"
          aria-label="Browse UI assets"
          aria-expanded={assetPickerOpen}
          onClick={() => setAssetPickerOpen((open) => !open)}
        >
          Assets…
        </button>
        <label>
          Theme
          <select
            aria-label="UI preview theme"
            value={previewTheme}
            onChange={(event) => setPreviewTheme(event.target.value)}
          >
            <option value="">Base</option>
            {asset.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
        <span className="haku-ui-editor__path">
          {uiAuthoringSession.path}
          {uiAuthoringSession.isDirty ? ' *' : ''}
        </span>
      </div>
      {assetPickerOpen && (
        <div className="haku-ui-editor__asset-picker" role="dialog" aria-label="UI asset picker">
          <div className="haku-ui-editor__asset-picker-header">
            <strong>Project assets</strong>
            <button
              type="button"
              onClick={() => setAssetPickerOpen(false)}
              aria-label="Close assets"
            >
              ×
            </button>
          </div>
          <AssetBrowserPanel />
        </div>
      )}
      {texturePickerOpen && (
        <div className="haku-ui-editor__texture-picker" role="dialog" aria-label="Choose texture">
          <div className="haku-ui-editor__asset-picker-header">
            <strong>Project textures</strong>
            <button
              type="button"
              aria-label="Close texture chooser"
              onClick={() => {
                setTexturePickerOpen(false)
                setPendingImageCreation(null)
              }}
            >
              ×
            </button>
          </div>
          {textures.length === 0 ? (
            <div className="haku-ui-editor__texture-empty">
              <p>No texture assets in the project manifest.</p>
              <button type="button" disabled>
                No textures available
              </button>
            </div>
          ) : (
            <ul>
              {textures.map((texture) => (
                <li key={`${texture.reference.$ref}:${texture.path}`}>
                  <button
                    type="button"
                    aria-label={`Use ${texture.name}`}
                    onClick={() => {
                      runHierarchyAction(
                        () =>
                          uiAuthoringSession.createElement('image', {
                            ...(pendingImageCreation ?? {}),
                            source: texture.reference,
                          }),
                        `Created Image from ${texture.path}`,
                      )
                      setTexturePickerOpen(false)
                      setPendingImageCreation(null)
                    }}
                  >
                    <span>{texture.name}</span>
                    <small>{texture.path}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <PanelGroup
        direction="horizontal"
        autoSaveId="haku-ui-editor-panels-h"
        className="haku-ui-editor__workspace"
      >
        <Panel defaultSize={20} minSize={14} maxSize={34}>
          <aside
            className="haku-ui-editor__hierarchy"
            aria-label="UI Layers"
            onDragOver={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              if (event.clientY - rect.top < 32) event.currentTarget.scrollTop -= 24
              else if (rect.bottom - event.clientY < 32) event.currentTarget.scrollTop += 24
            }}
          >
            <h3>Layers</h3>
            <div className="haku-ui-editor__palette" role="region" aria-label="Element palette">
              <input
                type="search"
                aria-label="Search UI elements"
                placeholder="Search elements"
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
              />
              <div className="haku-ui-editor__palette-grid">
                {palette.map((entry) => (
                  <button
                    key={entry.type}
                    type="button"
                    draggable
                    aria-label={`Add ${entry.label}`}
                    data-haku-ui-palette-kind={entry.type}
                    onClick={() => createElement(entry.type)}
                    onDragStart={(event) => {
                      paletteDragRef.current = entry.type
                      event.dataTransfer.effectAllowed = 'copy'
                      event.dataTransfer.setData('application/x-haku-ui-kind', entry.type)
                    }}
                    onDragEnd={() => {
                      paletteDragRef.current = null
                    }}
                  >
                    <span aria-hidden="true">{entry.icon}</span>
                    {entry.label}
                  </button>
                ))}
              </div>
              {palette.length === 0 && <p>No element types match “{paletteQuery}”.</p>}
            </div>
            <ul role="tree" aria-label="UI layer tree">
              {hierarchy.map((item) => (
                <HierarchyNode
                  key={item.id}
                  item={item}
                  rootId={asset.root}
                  elements={elements}
                  selected={selectedIds}
                  expanded={expandedLayers}
                  renamingId={renamingId}
                  dropIndicator={dropIndicator}
                  onSelect={(id, modified) =>
                    modified
                      ? uiAuthoringSession.toggleSelection(id)
                      : uiAuthoringSession.select(id)
                  }
                  onToggle={(id) =>
                    setExpandedLayers((current) => {
                      const next = new Set(current)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    })
                  }
                  onBeginRename={setRenamingId}
                  onCommitRename={(id, name) => {
                    runHierarchyAction(
                      () => uiAuthoringSession.renameElement(id, name),
                      `Renamed layer to ${name.trim()}`,
                    )
                    setRenamingId(null)
                  }}
                  onCancelRename={() => setRenamingId(null)}
                  onVisible={(id, visible) =>
                    runHierarchyAction(
                      () => uiAuthoringSession.setElementVisible(id, visible),
                      visible ? 'Layer shown' : 'Layer hidden',
                    )
                  }
                  onLock={(id, locked) => {
                    uiAuthoringSession.setEditorLocked(id, locked)
                    setStatus(locked ? 'Layer locked' : 'Layer unlocked')
                  }}
                  onDuplicate={(id) =>
                    runHierarchyAction(
                      () =>
                        uiAuthoringSession.duplicateElements(
                          selectedIds.includes(id) ? selectedIds : [id],
                        ),
                      'Duplicated layer selection',
                    )
                  }
                  onDelete={(id) =>
                    runHierarchyAction(
                      () =>
                        uiAuthoringSession.removeElements(
                          selectedIds.includes(id) ? selectedIds : [id],
                        ),
                      'Deleted layer selection',
                    )
                  }
                  onKeyDown={handleLayerKeyDown}
                  onDragStart={(event, id) => {
                    const ids = selectedIds.includes(id) ? selectedIds : [id]
                    if (!selectedIds.includes(id)) uiAuthoringSession.select(id)
                    hierarchyDragRef.current = ids
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('application/x-haku-ui-layers', ids.join(','))
                  }}
                  onDragOver={handleLayerDragOver}
                  onDrop={handleLayerDrop}
                />
              ))}
            </ul>
            <div className="haku-ui-editor__hierarchy-footer">
              <button
                type="button"
                disabled={selectedIds.length === 0 || selectedIds.includes(asset.root)}
                onClick={() =>
                  runHierarchyAction(
                    () => uiAuthoringSession.duplicateElements(selectedIds),
                    'Duplicated layer selection',
                  )
                }
              >
                Duplicate selected
              </button>
              <button
                type="button"
                disabled={selectedIds.length === 0 || selectedIds.includes(asset.root)}
                onClick={() =>
                  runHierarchyAction(
                    () => uiAuthoringSession.removeElements(selectedIds),
                    'Deleted layer selection',
                  )
                }
              >
                Delete selected
              </button>
            </div>
          </aside>
        </Panel>
        <PanelResizeHandle className="haku-resize-handle haku-resize-handle--horizontal" />
        <Panel defaultSize={56} minSize={32}>
          <main className="haku-ui-editor__preview" aria-label="UI Canvas">
            <div className="haku-ui-editor__viewport-label">{viewport.label}</div>
            <div
              ref={canvasHost}
              className="haku-ui-editor__viewport-scroll"
              data-haku-ui-canvas-cursor={canvasCursor}
              onPointerDown={beginPointerGesture}
              onPointerMove={updatePointerGesture}
              onPointerUp={commitPointerGesture}
              onPointerCancel={cancelGesture}
              onDoubleClick={enterNestedFrame}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
              style={{ cursor: canvasCursor }}
            >
              <div
                className="haku-ui-editor__canvas-content"
                style={{
                  width: viewport.width,
                  height: viewport.height,
                  transform: `translate(${canvasView.x}px, ${canvasView.y}px) scale(${canvasView.scale})`,
                }}
              >
                <div
                  ref={previewHost}
                  className="haku-ui-editor__viewport"
                  data-haku-ui-preview="true"
                  data-haku-ui-preview-scale={
                    canvasView.mode === 'fit' ? 'fit' : String(canvasView.scale)
                  }
                  data-haku-ui-preview-effective-scale={canvasView.scale}
                  data-haku-ui-preview-origin="center"
                  data-haku-ui-preview-mode={previewMode}
                  style={{ width: viewport.width, height: viewport.height }}
                />
                {previewMode === 'edit' && (
                  <div className="haku-ui-editor__overlay" aria-hidden="true">
                    {asset.elements.map((element, index) => {
                      const rect = gestureRects.get(element.id) ?? elementBounds.get(element.id)
                      if (
                        !rect ||
                        !element.visible ||
                        uiAuthoringSession.isEditorLocked(element.id)
                      )
                        return null
                      return (
                        <div
                          key={element.id}
                          className="haku-ui-editor__hit-target"
                          data-haku-ui-hit-target={element.id}
                          style={{
                            left: rect.x,
                            top: rect.y,
                            width: rect.width,
                            height: rect.height,
                            zIndex: index + 1,
                          }}
                        />
                      )
                    })}
                    {selectedIds.map((id) => {
                      const rect = gestureRects.get(id) ?? elementBounds.get(id)
                      return rect ? (
                        <div
                          key={id}
                          className="haku-ui-editor__selection-bounds"
                          data-haku-ui-selection-bounds={id}
                          style={{
                            left: rect.x,
                            top: rect.y,
                            width: rect.width,
                            height: rect.height,
                          }}
                        />
                      ) : null
                    })}
                    {selectedIds.length === 1 &&
                      selectedIds.map((id) => {
                        const rect = gestureRects.get(id) ?? elementBounds.get(id)
                        const element = asset.elements.find((candidate) => candidate.id === id)
                        if (!rect || !element || element.id === asset.root) return null
                        return (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const).map(
                          (handle) => (
                            <div
                              key={handle}
                              className={`haku-ui-editor__resize-handle haku-ui-editor__resize-handle--${handle}`}
                              data-haku-ui-resize-handle={handle}
                              data-haku-ui-hit-target={id}
                              style={resizeHandlePoint(rect, handle)}
                            />
                          ),
                        )
                      })}
                    {guides.map((guide, index) => (
                      <div
                        key={`${guide.axis}-${guide.guide}-${index}`}
                        className={`haku-ui-editor__guide haku-ui-editor__guide--${guide.axis}`}
                        data-haku-ui-guide={guide.kind}
                        style={guide.axis === 'x' ? { left: guide.guide } : { top: guide.guide }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <output aria-live="polite" data-haku-ui-status="true">
              {status}
            </output>
          </main>
        </Panel>
        <PanelResizeHandle className="haku-resize-handle haku-resize-handle--horizontal" />
        <Panel defaultSize={24} minSize={16} maxSize={40}>
          <aside className="haku-ui-editor__inspector" aria-label="UI Inspector">
            <h3>UI Inspector</h3>
            {selected ? <UIInspector element={selected} /> : <p>Select a UI element</p>}
          </aside>
        </Panel>
      </PanelGroup>
    </section>
  )
})
