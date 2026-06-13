import { create } from 'zustand'
import type { EntityId } from '@haku/core'
import { World, cloneWorld } from '@haku/core'
import type { SceneDocument } from '@haku/schema'
import { globalCommandBus } from '../commands/command-bus.js'

export type EditorMode = 'edit' | 'play'
export type TransformTool = 'translate' | 'rotate' | 'scale'

interface EditorState {
  projectRoot: string | null
  scenePath: string | null
  sceneDocument: SceneDocument | null
  world: World | null
  worldRevision: number
  selection: EntityId | null
  mode: EditorMode
  transformTool: TransformTool
  focusSelectionRequest: number
  playSnapshot: World | null
  commandRevision: number

  setProjectRoot: (root: string | null) => void
  setScene: (path: string, document: SceneDocument, world: World) => void
  setSceneDocument: (document: SceneDocument) => void
  setSelection: (id: EntityId | null) => void
  setWorld: (world: World) => void
  setMode: (mode: EditorMode) => void
  setTransformTool: (tool: TransformTool) => void
  requestFocusSelection: () => void
  enterPlayMode: () => void
  exitPlayMode: () => void
  bumpCommands: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectRoot: null,
  scenePath: null,
  sceneDocument: null,
  world: null,
  worldRevision: 0,
  selection: null,
  mode: 'edit',
  transformTool: 'translate',
  focusSelectionRequest: 0,
  playSnapshot: null,
  commandRevision: 0,

  setProjectRoot: (root) => set({ projectRoot: root }),
  setScene: (path, document, world) => {
    globalCommandBus.clear()
    set((s) => ({
      scenePath: path,
      sceneDocument: document,
      world,
      worldRevision: s.worldRevision + 1,
      selection: null,
    }))
  },
  setSceneDocument: (document) =>
    set((s) => ({
      sceneDocument: document,
      worldRevision: s.worldRevision + 1,
    })),
  setSelection: (id) => set({ selection: id }),
  setWorld: (world) => set((s) => ({ world, worldRevision: s.worldRevision + 1 })),
  setMode: (mode) => set({ mode }),
  setTransformTool: (tool) => set({ transformTool: tool }),
  requestFocusSelection: () => set((s) => ({ focusSelectionRequest: s.focusSelectionRequest + 1 })),

  enterPlayMode: () => {
    const { world } = get()
    if (!world) return
    set({ mode: 'play', playSnapshot: cloneWorld(world) })
  },

  exitPlayMode: () => {
    const { playSnapshot } = get()
    if (playSnapshot) {
      set((s) => ({
        mode: 'edit',
        world: playSnapshot,
        worldRevision: s.worldRevision + 1,
        playSnapshot: null,
        selection: null,
      }))
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
