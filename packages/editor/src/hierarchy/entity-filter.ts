import type { EntityId, IWorld } from '@haku/core'
import { TagComponent, entityId } from '@haku/core'

export type HierarchyFilterMode = 'all' | 'name' | 'type' | 'tag'

export const HIERARCHY_FILTER_MODE_LABELS: Record<HierarchyFilterMode, string> = {
  all: 'All',
  name: 'Name',
  type: 'Type',
  tag: 'Tag',
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

function entityDirectMatch(
  world: IWorld,
  id: EntityId,
  query: string,
  mode: HierarchyFilterMode,
): boolean {
  switch (mode) {
    case 'name':
      return (world.getEntityName(id) ?? '').toLowerCase().includes(query)
    case 'type':
      return world
        .getComponentTypes(id)
        .filter((typeId) => typeId !== 'Transform')
        .some((typeId) => typeId.toLowerCase().includes(query))
    case 'tag': {
      const tag = world.getComponent(id, TagComponent)
      return tag?.tags.some((value) => value.toLowerCase().includes(query)) ?? false
    }
    case 'all': {
      if ((world.getEntityName(id) ?? '').toLowerCase().includes(query)) return true
      if (
        world
          .getComponentTypes(id)
          .filter((typeId) => typeId !== 'Transform')
          .some((typeId) => typeId.toLowerCase().includes(query))
      ) {
        return true
      }
      const tag = world.getComponent(id, TagComponent)
      return tag?.tags.some((value) => value.toLowerCase().includes(query)) ?? false
    }
  }
}

function collectDescendants(world: IWorld, id: EntityId, into: Set<string>): void {
  for (const child of world.getChildren(id)) {
    into.add(child.value)
    collectDescendants(world, child, into)
  }
}

export function computeHierarchyFilterSets(
  world: IWorld,
  query: string,
  mode: HierarchyFilterMode,
): { active: boolean; visibleIds: Set<string> | null; highlightedIds: Set<string> | null } {
  const normalized = normalizeQuery(query)
  if (!normalized) {
    return { active: false, visibleIds: null, highlightedIds: null }
  }

  const matched = new Set<string>()
  for (const id of world.getAllEntities()) {
    if (entityDirectMatch(world, id, normalized, mode)) {
      matched.add(id.value)
    }
  }

  const visibleIds = new Set(matched)
  for (const idValue of matched) {
    let parent = world.getParent(entityId(idValue))
    while (parent) {
      visibleIds.add(parent.value)
      parent = world.getParent(parent)
    }
  }
  for (const idValue of matched) {
    collectDescendants(world, entityId(idValue), visibleIds)
  }

  return { active: true, visibleIds, highlightedIds: matched }
}
