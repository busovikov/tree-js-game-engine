import type { EntityId, World } from '@haku/core'

export function flattenVisibleHierarchy(
  world: World,
  roots: readonly EntityId[],
  visibleIds: Set<string> | null,
  collapsedIds?: ReadonlySet<string> | null,
): EntityId[] {
  const result: EntityId[] = []

  const walk = (id: EntityId) => {
    if (visibleIds && !visibleIds.has(id.value)) return
    result.push(id)
    // While a filter is active, always descend so matching descendants stay reachable.
    if (!visibleIds && collapsedIds?.has(id.value)) return
    for (const child of world.getChildren(id)) {
      walk(child)
    }
  }

  for (const root of roots) {
    walk(root)
  }

  return result
}

export function resolveRangeSelection(
  ordered: readonly EntityId[],
  anchor: EntityId,
  target: EntityId,
): EntityId[] {
  const anchorIndex = ordered.findIndex((id) => id.value === anchor.value)
  const targetIndex = ordered.findIndex((id) => id.value === target.value)
  if (anchorIndex === -1 || targetIndex === -1) return [target]

  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  return ordered.slice(start, end + 1)
}
