import type { TransformTool } from '../store/editor-store.js'
import { useEditorStore } from '../store/editor-store.js'

export const FOCUS_SELECTION_SHORTCUT = 'F'

export const TRANSFORM_TOOL_SHORTCUT: Record<TransformTool, string> = {
  hand: 'Q',
  translate: 'W',
  rotate: 'E',
  scale: 'R',
}

const TRANSFORM_TOOL_BY_KEY: Record<string, TransformTool> = {
  q: 'hand',
  w: 'translate',
  e: 'rotate',
  r: 'scale',
}

export function formatToolTitle(title: string, shortcut: string): string {
  return `${title} (${shortcut})`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/** Returns true when a tool shortcut was handled. */
export function handleTransformToolShortcut(event: KeyboardEvent): boolean {
  if (useEditorStore.getState().mode === 'play') return false
  if (event.repeat) return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (isEditableTarget(event.target)) return false

  const key = event.key.toLowerCase()

  if (key === FOCUS_SELECTION_SHORTCUT.toLowerCase()) {
    const { world, mode, selection } = useEditorStore.getState()
    if (!world || mode !== 'edit' || !selection) return false
    useEditorStore.getState().requestFocusSelection()
    event.preventDefault()
    return true
  }

  const tool = TRANSFORM_TOOL_BY_KEY[key]
  if (!tool) return false

  const { world, mode, selection, viewportCameraEntityId } = useEditorStore.getState()
  if (!world || mode !== 'edit') return false

  if (tool === 'hand') {
    if (viewportCameraEntityId) return false
  } else if (!selection) {
    return false
  }

  useEditorStore.getState().setTransformTool(tool)
  event.preventDefault()
  return true
}
