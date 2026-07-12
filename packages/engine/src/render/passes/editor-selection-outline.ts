/** @deprecated Import from editor-selection-edges.js */
export { EditorSelectionEdgeSync as EditorSelectionOutlinePass } from './editor-selection-edges.js'

export function editorOutlineEnabled(_settings: unknown, targetCount: number): boolean {
  return targetCount > 0
}
