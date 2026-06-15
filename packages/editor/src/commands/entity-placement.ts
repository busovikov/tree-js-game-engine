import type { EntityId, World } from '@haku/core'
import { TransformComponent, getCoreComponent } from '@haku/core'
import type { Transform } from '@haku/schema'

export type EntityPlacement = 'root' | 'child' | 'parent'

export function uniqueEntityName(world: World, base: string): string {
  const names = new Set(world.getAllEntities().map((id) => world.getEntityName(id)))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}

function existingEntityNames(world: World): Set<string> {
  const names = new Set<string>()
  for (const id of world.getAllEntities()) {
    const name = world.getEntityName(id)
    if (name) names.add(name)
  }
  return names
}

/** box → box1, box2 → box3 (trailing digits increment, no spaces). */
export function nextDuplicateEntityName(world: World, sourceName: string): string {
  return nextDuplicateEntityNameFromSet(existingEntityNames(world), sourceName)
}

function nextDuplicateEntityNameFromSet(names: Set<string>, sourceName: string): string {
  const match = sourceName.match(/^(.*?)(\d+)$/)
  const base = match ? match[1] : sourceName
  let n = match ? parseInt(match[2], 10) + 1 : 1

  while (names.has(`${base}${n}`)) n++
  const next = `${base}${n}`
  names.add(next)
  return next
}

function rootSpawnPosition(world: World): [number, number, number] {
  const roots = world.getRootEntities()
  const index = Math.max(0, roots.length - 1)
  return [index * 1.5, 0, 0]
}

const IDENTITY_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
}

export function createEntityWithPlacement(
  world: World,
  name: string,
  placement: EntityPlacement,
  selection: EntityId | null,
): EntityId {
  const defaults = TransformComponent.defaults!()
  const id = world.createEntity(name)

  if (placement === 'parent') {
    if (!selection || !world.hasEntity(selection)) {
      throw new Error('Selection required to create a parent entity')
    }

    const childTransform = world.getComponent(selection, TransformComponent) ?? defaults
    const grandparent = world.getParent(selection)

    world.addComponent(id, TransformComponent, structuredClone(childTransform))
    world.setParent(id, grandparent)
    world.setParent(selection, id)
    world.addComponent(selection, TransformComponent, structuredClone(IDENTITY_TRANSFORM))
    return id
  }

  if (placement === 'child') {
    if (!selection || !world.hasEntity(selection)) {
      throw new Error('Selection required to create a child entity')
    }

    world.addComponent(id, TransformComponent, structuredClone(defaults))
    world.setParent(id, selection)
    return id
  }

  world.addComponent(id, TransformComponent, {
    ...defaults,
    position: rootSpawnPosition(world),
  })
  return id
}

function collectEntitySubtree(world: World, root: EntityId): EntityId[] {
  const result: EntityId[] = [root]
  for (const child of world.getChildren(root)) {
    result.push(...collectEntitySubtree(world, child))
  }
  return result
}

export function duplicateEntitySubtree(world: World, sourceId: EntityId): EntityId {
  const entities = collectEntitySubtree(world, sourceId)
  const idMap = new Map<string, EntityId>()
  const names = existingEntityNames(world)

  for (const oldId of entities) {
    const baseName = world.getEntityName(oldId) ?? 'Entity'
    const name = nextDuplicateEntityNameFromSet(names, baseName)
    const newId = world.createEntity(name)
    idMap.set(oldId.value, newId)

    for (const typeId of world.getComponentTypes(oldId)) {
      const type = getCoreComponent(typeId)
      if (!type) continue
      const data = world.getComponent(oldId, type)
      if (data !== undefined) {
        world.addComponent(newId, type, structuredClone(data))
      }
    }
  }

  const newRoot = idMap.get(sourceId.value)!
  const sourceParent = world.getParent(sourceId)
  world.setParent(newRoot, sourceParent)
  world.moveEntityInHierarchy(newRoot, sourceId, 'after')

  for (const oldId of entities) {
    if (oldId.value === sourceId.value) continue
    const newId = idMap.get(oldId.value)!
    const oldParent = world.getParent(oldId)
    const mappedParent = oldParent ? idMap.get(oldParent.value) : undefined
    if (mappedParent) {
      world.setParent(newId, mappedParent)
    }
  }

  return newRoot
}
