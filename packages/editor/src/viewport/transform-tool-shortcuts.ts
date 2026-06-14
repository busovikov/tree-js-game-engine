import type { TransformTool } from '../store/editor-store.js'
import { canActivateTransformTool, useEditorStore } from '../store/editor-store.js'

export const FOCUS_SELECTION_SHORTCUT = 'F'

export const TRANSFORM_TOOL_SHORTCUT: Record<TransformTool, string> = {
  hand: 'Q',
  translate: 'W',
  rotate: 'E',
  scale: 'R',
}

/** Physical key codes — layout-independent (QWERTY labels on any keyboard language). */
const TRANSFORM_TOOL_BY_CODE: Record<string, TransformTool> = {
  KeyQ: 'hand',
  KeyW: 'translate',
  KeyE: 'rotate',
  KeyR: 'scale',
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

  if (event.code === 'KeyF') {
    const { world, mode, selection } = useEditorStore.getState()
    if (!world || mode !== 'edit' || !selection) return false
    useEditorStore.getState().requestFocusSelection()
    event.preventDefault()
    return true
  }

  const tool = TRANSFORM_TOOL_BY_CODE[event.code]
  if (!tool) return false

  const state = useEditorStore.getState()
  if (!canActivateTransformTool(tool, state)) return false

  useEditorStore.getState().setTransformTool(tool)
  event.preventDefault()
  return true
}
