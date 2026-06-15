import type { ComponentType, EntityId, World } from '@haku/core'

export type MixedNumber = number | null
export type MixedVec3 = [MixedNumber, MixedNumber, MixedNumber]
export type MixedBool = boolean | null

export function mergeNumbers(values: readonly number[]): MixedNumber {
  if (values.length === 0) return null
  const first = values[0]!
  return values.every((value) => value === first) ? first : null
}

export function mergeBooleans(values: readonly boolean[]): MixedBool {
  if (values.length === 0) return null
  const first = values[0]!
  return values.every((value) => value === first) ? first : null
}

export function mergeVec3(values: readonly [number, number, number][]): MixedVec3 {
  return [
    mergeNumbers(values.map((value) => value[0])),
    mergeNumbers(values.map((value) => value[1])),
    mergeNumbers(values.map((value) => value[2])),
  ]
}

export function mergeStrings(values: readonly string[]): string | null {
  if (values.length === 0) return null
  const first = values[0]!
  return values.every((value) => value === first) ? first : null
}

export function commonComponentTypes(world: World, ids: readonly EntityId[]): string[] {
  if (ids.length === 0) return []

  let common = new Set(world.getComponentTypes(ids[0]!))
  for (const id of ids.slice(1)) {
    const types = new Set(world.getComponentTypes(id))
    common = new Set([...common].filter((typeId) => types.has(typeId)))
  }

  return [...common]
}

export function entitiesWithComponent<T>(
  world: World,
  ids: readonly EntityId[],
  component: ComponentType<T>,
): EntityId[] {
  return ids.filter((id) => world.hasComponent(id, component))
}
