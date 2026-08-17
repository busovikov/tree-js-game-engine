export interface UICanvasHit {
  readonly id: string
  readonly paintOrder: number
  readonly depth: number
  readonly hidden?: boolean
  readonly editorLocked?: boolean
  readonly disabled?: boolean
}

export type UISelectionAction =
  | { readonly type: 'replace'; readonly id: string }
  | { readonly type: 'toggle'; readonly id: string }
  | {
      readonly type: 'reconcile'
      readonly validIds: ReadonlySet<string>
      readonly fallback?: string
    }

export function orderCanvasHits(hits: readonly UICanvasHit[]): readonly string[] {
  return hits
    .filter((hit) => !hit.hidden && !hit.editorLocked)
    .sort((a, b) => b.paintOrder - a.paintOrder || b.depth - a.depth)
    .map((hit) => hit.id)
}

export function cycleCanvasHit(
  orderedHits: readonly string[],
  currentPrimary: string | null,
): string | null {
  if (orderedHits.length === 0) return null
  const currentIndex = currentPrimary ? orderedHits.indexOf(currentPrimary) : -1
  return orderedHits[(currentIndex + 1) % orderedHits.length] ?? orderedHits[0] ?? null
}

export function reduceUISelection(
  current: readonly string[],
  action: UISelectionAction,
  parentById: ReadonlyMap<string, string | null>,
): readonly string[] {
  if (action.type === 'replace') return [action.id]
  if (action.type === 'reconcile') {
    const retained = current.filter((id) => action.validIds.has(id))
    if (retained.length > 0) return retained
    return action.fallback && action.validIds.has(action.fallback) ? [action.fallback] : []
  }

  if (current.includes(action.id)) {
    return current.filter((id) => id !== action.id)
  }
  const primary = current.at(-1)
  if (primary && parentById.get(primary) !== parentById.get(action.id)) return [action.id]
  return [...current, action.id]
}
