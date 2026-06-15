import { create } from 'zustand'
import type { EntityId } from '@haku/core'
import { World, cloneWorld } from '@haku/core'
import type { SceneDocument } from '@haku/schema'
import { globalCommandBus } from '../commands/command-bus.js'
import { resolveClickSelection } from '../selection/selection-utils.js'
import type { HierarchyFilterMode } from '../hierarchy/entity-filter.js'

export type EditorMode = 'edit' | 'play'
export type TransformTool = 'translate' | 'rotate' | 'scale' | 'hand'

export function canActivateTransformTool(
  tool: TransformTool,
  state: Pick<EditorState, 'world' | 'mode' | 'viewportCameraEntityId'>,
): boolean {
  if (!state.world || state.mode !== 'edit') return false
  if (tool === 'hand') return !state.viewportCameraEntityId
  return true
}

interface EditorState {
  projectRoot: string | null
  scenePath: string | null
  sceneDocument: SceneDocument | null
  world: World | null
  worldRevision: number
  selection: EntityId[]
  selectionAnchor: EntityId | null
  mode: EditorMode
  transformTool: TransformTool
  snapEnabled: boolean
  showAabb: boolean
  uniformScaleLocked: boolean
  /** When set, viewport renders through this scene camera entity; otherwise editor scene camera. */
  viewportCameraEntityId: EntityId | null
  focusSelectionRequest: number
  playSnapshot: World | null
  commandRevision: number
  hierarchyFilterQuery: string
  hierarchyFilterMode: HierarchyFilterMode

  setProjectRoot: (root: string | null) => void
  setScene: (path: string, document: SceneDocument, world: World) => void
  setSceneDocument: (document: SceneDocument) => void
  setSelection: (ids: EntityId[]) => void
  selectEntity: (id: EntityId, additive?: boolean) => void
  selectEntityRange: (ids: EntityId[]) => void
  setWorld: (world: World) => void
  setMode: (mode: EditorMode) => void
  setTransformTool: (tool: TransformTool) => void
  setSnapEnabled: (enabled: boolean) => void
  setShowAabb: (enabled: boolean) => void
  setUniformScaleLocked: (locked: boolean) => void
  setViewportCameraEntityId: (id: EntityId | null) => void
  requestFocusSelection: () => void
  enterPlayMode: () => void
  exitPlayMode: () => void
  bumpCommands: () => void
  setHierarchyFilterQuery: (query: string) => void
  setHierarchyFilterMode: (mode: HierarchyFilterMode) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectRoot: null,
  scenePath: null,
  sceneDocument: null,
  world: null,
  worldRevision: 0,
  selection: [],
  selectionAnchor: null,
  mode: 'edit',
  transformTool: 'translate',
  snapEnabled: false,
  showAabb: false,
  uniformScaleLocked: false,
  viewportCameraEntityId: null,
  focusSelectionRequest: 0,
  playSnapshot: null,
  commandRevision: 0,
  hierarchyFilterQuery: '',
  hierarchyFilterMode: 'all',

  setProjectRoot: (root) => set({ projectRoot: root }),
  setScene: (path, document, world) => {
    globalCommandBus.clear()
    set((s) => ({
      scenePath: path,
      sceneDocument: document,
      world,
      worldRevision: s.worldRevision + 1,
      selection: [],
      selectionAnchor: null,
      viewportCameraEntityId: null,
    }))
  },
  setSceneDocument: (document) =>
    set((s) => ({
      sceneDocument: document,
      worldRevision: s.worldRevision + 1,
    })),
  setSelection: (ids) => set({ selection: ids, selectionAnchor: ids[ids.length - 1] ?? null }),
  selectEntity: (id, additive = false) =>
    set((state) => ({
      selection: resolveClickSelection(state.selection, id, additive),
      selectionAnchor: id,
    })),
  selectEntityRange: (ids) => set({ selection: ids, selectionAnchor: ids[ids.length - 1] ?? null }),
  setWorld: (world) => set((s) => ({ world, worldRevision: s.worldRevision + 1 })),
  setMode: (mode) => set({ mode }),
  setTransformTool: (tool) => {
    const state = get()
    if (!canActivateTransformTool(tool, state)) return
    set({ transformTool: tool })
  },
  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
  setShowAabb: (enabled) => set({ showAabb: enabled }),
  setUniformScaleLocked: (locked) => set({ uniformScaleLocked: locked }),
  setViewportCameraEntityId: (id) => set({ viewportCameraEntityId: id }),
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
        selection: [],
        selectionAnchor: null,
      }))
    } else {
      set({ mode: 'edit' })
    }
  },

  bumpCommands: () => set((s) => ({ commandRevision: s.commandRevision + 1 })),
  setHierarchyFilterQuery: (query) => set({ hierarchyFilterQuery: query }),
  setHierarchyFilterMode: (mode) => set({ hierarchyFilterMode: mode }),
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
