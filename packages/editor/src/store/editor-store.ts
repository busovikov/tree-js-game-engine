import type { EntityId } from '@haku/core'
import { create } from 'zustand'
import type { SceneDocument, ViewportTab } from '@haku/schema'
import { World, cloneWorld } from '@haku/core'
import { globalCommandBus } from '../commands/command-bus.js'
import { resolveClickSelection } from '../selection/selection-utils.js'
import type { HierarchyFilterMode } from '../hierarchy/entity-filter.js'
import type { ColliderBakeService } from '../viewport/collider-mesh-bake.js'

export type EditorMode = 'edit' | 'play'
export type TransformTool = 'translate' | 'rotate' | 'scale' | 'hand'
export type GizmoSpace = 'local' | 'world'

export interface ComponentClipboard {
  typeId: string
  data: Record<string, unknown>
}

export function canActivateTransformTool(
  tool: TransformTool,
  state: Pick<EditorState, 'world' | 'mode' | 'activeViewportTab'>,
): boolean {
  if (!state.world || state.mode !== 'edit') return false
  if (tool === 'hand') return state.activeViewportTab === 'scene'
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
  showShadowVolume: boolean
  showAllColliders: boolean
  showPhysicsDebug: boolean
  uniformScaleLocked: boolean
  colliderResizeActive: boolean
  colliderBakeService: ColliderBakeService | null
  gizmoSpace: GizmoSpace
  activeViewportTab: ViewportTab
  playPreviousTab: ViewportTab | null
  focusSelectionRequest: number
  playSnapshot: World | null
  commandRevision: number
  hierarchyFilterQuery: string
  hierarchyFilterMode: HierarchyFilterMode
  componentClipboard: ComponentClipboard | null

  setProjectRoot: (root: string | null) => void
  setScene: (path: string, document: SceneDocument, world: World, viewportTab?: ViewportTab) => void
  setSceneDocument: (document: SceneDocument) => void
  setSelection: (ids: EntityId[]) => void
  selectEntity: (id: EntityId, additive?: boolean) => void
  selectEntityRange: (ids: EntityId[]) => void
  setWorld: (world: World) => void
  setMode: (mode: EditorMode) => void
  setTransformTool: (tool: TransformTool) => void
  setSnapEnabled: (enabled: boolean) => void
  setShowAabb: (enabled: boolean) => void
  setShowShadowVolume: (enabled: boolean) => void
  setShowAllColliders: (enabled: boolean) => void
  setShowPhysicsDebug: (enabled: boolean) => void
  setUniformScaleLocked: (locked: boolean) => void
  setColliderResizeActive: (active: boolean) => void
  setColliderBakeService: (service: ColliderBakeService | null) => void
  setGizmoSpace: (space: GizmoSpace) => void
  setActiveViewportTab: (tab: ViewportTab) => void
  requestFocusSelection: () => void
  enterPlayMode: () => void
  exitPlayMode: () => void
  bumpCommands: () => void
  setHierarchyFilterQuery: (query: string) => void
  setHierarchyFilterMode: (mode: HierarchyFilterMode) => void
  setComponentClipboard: (clipboard: ComponentClipboard | null) => void
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
  showShadowVolume: false,
  showAllColliders: false,
  showPhysicsDebug: false,
  uniformScaleLocked: false,
  colliderResizeActive: false,
  colliderBakeService: null,
  gizmoSpace: 'local',
  activeViewportTab: 'scene',
  playPreviousTab: null,
  focusSelectionRequest: 0,
  playSnapshot: null,
  commandRevision: 0,
  hierarchyFilterQuery: '',
  hierarchyFilterMode: 'all',
  componentClipboard: null,

  setProjectRoot: (root) => set({ projectRoot: root }),
  setScene: (path, document, world, viewportTab = 'scene') => {
    globalCommandBus.clear()
    set((s) => ({
      scenePath: path,
      sceneDocument: document,
      world,
      worldRevision: s.worldRevision + 1,
      selection: [],
      selectionAnchor: null,
      activeViewportTab: viewportTab,
      playPreviousTab: null,
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
  setShowShadowVolume: (enabled) => set({ showShadowVolume: enabled }),
  setShowAllColliders: (enabled) => set({ showAllColliders: enabled }),
  setShowPhysicsDebug: (enabled) => set({ showPhysicsDebug: enabled }),
  setUniformScaleLocked: (locked) => set({ uniformScaleLocked: locked }),
  setColliderResizeActive: (active) => set({ colliderResizeActive: active }),
  setColliderBakeService: (service) => set({ colliderBakeService: service }),
  setGizmoSpace: (space) => set({ gizmoSpace: space }),
  setActiveViewportTab: (tab) => set({ activeViewportTab: tab }),
  requestFocusSelection: () => set((s) => ({ focusSelectionRequest: s.focusSelectionRequest + 1 })),

  enterPlayMode: () => {
    const { world, activeViewportTab } = get()
    if (!world) return
    set({
      mode: 'play',
      playSnapshot: cloneWorld(world),
      playPreviousTab: activeViewportTab,
      activeViewportTab: 'view',
    })
  },

  exitPlayMode: () => {
    const { playSnapshot, playPreviousTab } = get()
    if (playSnapshot) {
      set((s) => ({
        mode: 'edit',
        world: playSnapshot,
        worldRevision: s.worldRevision + 1,
        playSnapshot: null,
        selection: [],
        selectionAnchor: null,
        activeViewportTab: playPreviousTab ?? s.activeViewportTab,
        playPreviousTab: null,
      }))
    } else {
      set((s) => ({
        mode: 'edit',
        activeViewportTab: playPreviousTab ?? s.activeViewportTab,
        playPreviousTab: null,
      }))
    }
  },

  bumpCommands: () => set((s) => ({ commandRevision: s.commandRevision + 1 })),
  setHierarchyFilterQuery: (query) => set({ hierarchyFilterQuery: query }),
  setHierarchyFilterMode: (mode) => set({ hierarchyFilterMode: mode }),
  setComponentClipboard: (clipboard) => set({ componentClipboard: clipboard }),
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
