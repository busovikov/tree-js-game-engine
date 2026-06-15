import type { EntityId } from '@haku/core'
import { entityId } from '@haku/core'

export function isEntitySelected(selection: readonly EntityId[], id: EntityId): boolean {
  return selection.some((item) => item.value === id.value)
}

export function primarySelection(selection: readonly EntityId[]): EntityId | null {
  return selection.length > 0 ? selection[selection.length - 1]! : null
}

export function resolveClickSelection(
  current: readonly EntityId[],
  id: EntityId,
  additive: boolean,
): EntityId[] {
  if (!additive) return [id]

  if (isEntitySelected(current, id)) {
    const next = current.filter((item) => item.value !== id.value)
    return next.length > 0 ? next : []
  }

  return [...current, id]
}

export function mergeSelection(
  current: readonly EntityId[],
  next: readonly EntityId[],
  additive: boolean,
): EntityId[] {
  if (!additive) return [...next]
  const merged = new Map<string, EntityId>()
  for (const id of current) merged.set(id.value, id)
  for (const id of next) merged.set(id.value, id)
  return [...merged.values()]
}

export function selectionFromSnapshot(value: EntityId[] | null): EntityId[] {
  return value ? value.map((id) => entityId(id.value)) : []
}
