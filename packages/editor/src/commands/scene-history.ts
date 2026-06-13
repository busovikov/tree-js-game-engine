import type { EntityId, World } from '@haku/core'
import { cloneWorld } from '@haku/core'
import { TransformComponent } from '@haku/core'
import type { SceneDocument, Transform } from '@haku/schema'
import type { Command } from './command-bus.js'
import { globalCommandBus } from './command-bus.js'
import { useEditorStore } from '../store/editor-store.js'

const EPSILON = 1e-4

export interface SceneSnapshot {
  world: World
  sceneDocument: SceneDocument | null
  selection: EntityId | null
}

function cloneSceneDocument(document: SceneDocument | null): SceneDocument | null {
  return document ? structuredClone(document) : null
}

export function cloneSceneSnapshot(snapshot: SceneSnapshot): SceneSnapshot {
  return {
    world: cloneWorld(snapshot.world),
    sceneDocument: cloneSceneDocument(snapshot.sceneDocument),
    selection: snapshot.selection,
  }
}

export function captureSceneSnapshot(): SceneSnapshot {
  const { world, sceneDocument, selection } = useEditorStore.getState()
  if (!world) throw new Error('No scene loaded')

  return {
    world: cloneWorld(world),
    sceneDocument: cloneSceneDocument(sceneDocument),
    selection,
  }
}

export function applySceneSnapshot(snapshot: SceneSnapshot): void {
  const next = cloneSceneSnapshot(snapshot)
  useEditorStore.setState((state) => ({
    world: next.world,
    sceneDocument: next.sceneDocument,
    selection: next.selection,
    worldRevision: state.worldRevision + 1,
  }))
}

export class SceneEditCommand implements Command {
  private readonly before: SceneSnapshot
  private readonly after: SceneSnapshot

  constructor(before: SceneSnapshot, after: SceneSnapshot) {
    this.before = cloneSceneSnapshot(before)
    this.after = cloneSceneSnapshot(after)
  }

  execute(): void {
    applySceneSnapshot(this.after)
  }

  undo(): void {
    applySceneSnapshot(this.before)
  }
}

export function commitSceneEdit(
  edit: (draft: { world: World; sceneDocument: SceneDocument | null }) => EntityId | null | void,
): void {
  const before = captureSceneSnapshot()
  const draftWorld = cloneWorld(before.world)
  const draftDocument = cloneSceneDocument(before.sceneDocument)

  const selectionOverride = edit({ world: draftWorld, sceneDocument: draftDocument })

  const after: SceneSnapshot = {
    world: draftWorld,
    sceneDocument: draftDocument,
    selection: selectionOverride !== undefined ? selectionOverride : before.selection,
  }

  applySceneSnapshot(after)
  globalCommandBus.record(new SceneEditCommand(before, after))
}

/** Record a transform edit that is already applied to the live scene (e.g. gizmo drag). */
export function commitTransformChange(entityId: EntityId, before: Transform, after: Transform): void {
  if (transformsEqual(before, after)) return

  const afterSnapshot = captureSceneSnapshot()
  const beforeWorld = cloneWorld(afterSnapshot.world)
  beforeWorld.addComponent(entityId, TransformComponent, before)

  const beforeSnapshot: SceneSnapshot = {
    world: beforeWorld,
    sceneDocument: cloneSceneDocument(afterSnapshot.sceneDocument),
    selection: afterSnapshot.selection,
  }

  globalCommandBus.record(new SceneEditCommand(beforeSnapshot, cloneSceneSnapshot(afterSnapshot)))
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON
}

function vec3Equal(a: readonly number[], b: readonly number[]): boolean {
  return nearlyEqual(a[0], b[0]) && nearlyEqual(a[1], b[1]) && nearlyEqual(a[2], b[2])
}

function quatEqual(a: readonly number[], b: readonly number[]): boolean {
  const same =
    nearlyEqual(a[0], b[0]) &&
    nearlyEqual(a[1], b[1]) &&
    nearlyEqual(a[2], b[2]) &&
    nearlyEqual(a[3], b[3])
  if (same) return true

  return (
    nearlyEqual(a[0], -b[0]) &&
    nearlyEqual(a[1], -b[1]) &&
    nearlyEqual(a[2], -b[2]) &&
    nearlyEqual(a[3], -b[3])
  )
}

export function transformsEqual(a: Transform, b: Transform): boolean {
  return (
    vec3Equal(a.position, b.position) &&
    quatEqual(a.rotation, b.rotation) &&
    vec3Equal(a.scale, b.scale)
  )
}
