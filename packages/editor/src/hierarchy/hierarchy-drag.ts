import type { EntityId, IWorld } from '@haku/core'

export type HierarchyDropMode = 'before' | 'after' | 'child'

export function isEntityAncestor(world: IWorld, ancestor: EntityId, candidate: EntityId): boolean {
  let current: EntityId | null = candidate
  while (current) {
    if (current.value === ancestor.value) return true
    current = world.getParent(current)
  }
  return false
}

export function canDropEntity(
  world: IWorld,
  dragged: EntityId,
  target: EntityId,
  mode: HierarchyDropMode,
): boolean {
  if (dragged.value === target.value) return false
  if (isEntityAncestor(world, dragged, target)) return false

  if (mode === 'before' || mode === 'after') {
    const parent = world.getParent(target)
    if (parent && isEntityAncestor(world, dragged, parent)) return false
  }

  return true
}

export function resolveDropMode(clientY: number, rect: DOMRect): HierarchyDropMode {
  const relativeY = clientY - rect.top
  const ratio = relativeY / Math.max(rect.height, 1)

  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  return 'child'
}
