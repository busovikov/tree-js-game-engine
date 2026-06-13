import { create } from 'zustand'
import type { EntityId } from '@haku/core'
import { World, cloneWorld } from '@haku/core'
import type { SceneDocument } from '@haku/schema'
import { globalCommandBus } from '../commands/command-bus.js'

export type EditorMode = 'edit' | 'play'

interface EditorState {
  projectRoot: string | null
  scenePath: string | null
  sceneDocument: SceneDocument | null
  world: World | null
  selection: EntityId | null
  mode: EditorMode
  playSnapshot: World | null
  commandRevision: number

  setProjectRoot: (root: string | null) => void
  setScene: (path: string, document: SceneDocument, world: World) => void
  setSelection: (id: EntityId | null) => void
  setWorld: (world: World) => void
  setMode: (mode: EditorMode) => void
  enterPlayMode: () => void
  exitPlayMode: () => void
  bumpCommands: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectRoot: null,
  scenePath: null,
  sceneDocument: null,
  world: null,
  selection: null,
  mode: 'edit',
  playSnapshot: null,
  commandRevision: 0,

  setProjectRoot: (root) => set({ projectRoot: root }),
  setScene: (path, document, world) =>
    set({ scenePath: path, sceneDocument: document, world, selection: null }),
  setSelection: (id) => set({ selection: id }),
  setWorld: (world) => set({ world }),
  setMode: (mode) => set({ mode }),

  enterPlayMode: () => {
    const { world } = get()
    if (!world) return
    set({ mode: 'play', playSnapshot: cloneWorld(world) })
  },

  exitPlayMode: () => {
    const { playSnapshot } = get()
    if (playSnapshot) {
      set({ mode: 'edit', world: playSnapshot, playSnapshot: null, selection: null })
    } else {
      set({ mode: 'edit' })
    }
  },

  bumpCommands: () => set((s) => ({ commandRevision: s.commandRevision + 1 })),
}))

globalCommandBus.subscribe(() => {
  useEditorStore.getState().bumpCommands()
})

export function useSelectionStore() {
  return useEditorStore((s) => ({ selection: s.selection, setSelection: s.setSelection }))
}

export function useWorldStore() {
  return useEditorStore((s) => ({ world: s.world, setWorld: s.setWorld, sceneDocument: s.sceneDocument }))
}

export function useModeStore() {
  return useEditorStore((s) => ({
    mode: s.mode,
    enterPlayMode: s.enterPlayMode,
    exitPlayMode: s.exitPlayMode,
  }))
}
