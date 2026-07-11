import type { GizmoSpace, TransformTool } from '../store/editor-store.js'
import { canActivateTransformTool, useEditorStore } from '../store/editor-store.js'
import { deleteSelectedEntities, duplicateSelectedEntity } from '../commands/world-commands.js'

export const FOCUS_SELECTION_SHORTCUT = 'F'
export const GIZMO_SPACE_SHORTCUT = 'X'

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

/** Returns true when delete was handled. */
export function handleDeleteShortcut(event: KeyboardEvent): boolean {
  if (useEditorStore.getState().mode === 'play') return false
  if (event.repeat) return false
  if (isEditableTarget(event.target)) return false

  const isDeleteKey = event.code === 'Delete' || event.code === 'Backspace'
  if (!isDeleteKey) return false

  const isCmdBackspace = event.code === 'Backspace' && event.metaKey
  if (!isCmdBackspace && (event.metaKey || event.ctrlKey || event.altKey)) return false

  const { selection, world } = useEditorStore.getState()
  if (!world || selection.length === 0) return false

  deleteSelectedEntities()
  event.preventDefault()
  return true
}

/** Returns true when duplicate (Cmd/Ctrl+D) was handled. */
export function handleDuplicateShortcut(event: KeyboardEvent): boolean {
  if (useEditorStore.getState().mode === 'play') return false
  if (event.repeat) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  if (event.code !== 'KeyD') return false
  if (isEditableTarget(event.target)) return false

  const target = event.target
  if (target instanceof HTMLElement && target.closest('[data-haku-asset-browser]')) {
    return false
  }

  const { world, selection } = useEditorStore.getState()
  if (!world || selection.length === 0) return false
  if (!selection.some((id) => world.hasEntity(id))) return false

  duplicateSelectedEntity()
  event.preventDefault()
  return true
}

/** Returns true when a tool shortcut was handled. */
export function handleTransformToolShortcut(event: KeyboardEvent): boolean {
  if (useEditorStore.getState().mode === 'play') return false
  if (event.repeat) return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (isEditableTarget(event.target)) return false

  if (event.code === 'KeyF') {
    const { world, mode, selection } = useEditorStore.getState()
    if (!world || mode !== 'edit' || selection.length === 0) return false
    useEditorStore.getState().requestFocusSelection()
    event.preventDefault()
    return true
  }

  if (event.code === 'KeyX') {
    const { world, mode } = useEditorStore.getState()
    if (!world || mode !== 'edit') return false
    const next: GizmoSpace = useEditorStore.getState().gizmoSpace === 'local' ? 'world' : 'local'
    useEditorStore.getState().setGizmoSpace(next)
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
