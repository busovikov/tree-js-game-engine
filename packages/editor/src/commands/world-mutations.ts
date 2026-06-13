import type { World } from '@haku/core'
import { cloneWorld } from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'

export function mutateWorld(mutator: (world: World) => void): World | null {
  const current = useEditorStore.getState().world
  if (!current) return null

  const next = cloneWorld(current)
  mutator(next)
  useEditorStore.getState().setWorld(next)
  return next
}
