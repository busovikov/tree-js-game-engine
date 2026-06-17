import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Engine } from '@haku/engine'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { TransformComponent, type EntityId } from '@haku/core'
import { projectService } from '../services/project-service.js'
import { useEditorStore } from '../store/editor-store.js'
import { commitMultiTransformChange, commitTransformChange, transformsEqual } from '../commands/scene-history.js'
import { computeHierarchyFilterSets } from '../hierarchy/entity-filter.js'
import { focusSelection } from '../viewport/focus-selection.js'
import {
  focusSelectionBounds,
  SelectionTransformPivot,
  type EntityDragSnapshot,
} from '../viewport/selection-transform-pivot.js'
import { applyAabbEdgeSnap, applyAabbEdgeSnapToSelectionPivot } from '../viewport/aabb-snap.js'
import { applyEditorTransformGizmoLayout, applyScaleGizmoConstraint, shouldTrackUniformScaleDrag } from '../viewport/transform-gizmo-config.js'
import { applyOrbitToolMode } from '../viewport/viewport-orbit.js'
import { attachCameraLookControls } from '../viewport/viewport-camera-look.js'
import { SceneCameraGizmos } from '../viewport/scene-camera-gizmos.js'
import { SceneLightGizmos } from '../viewport/scene-light-gizmos.js'
import { primarySelection, mergeSelection } from '../selection/selection-utils.js'
import { SceneAabbGizmos } from '../viewport/scene-aabb-gizmos.js'
import { SceneSelectionOutline } from '../viewport/scene-selection-outline.js'

function refreshGizmo(
  gizmo: TransformControls,
  selection: EntityId[],
  pivot: SelectionTransformPivot,
  getObject3D: (id: EntityId) => import('three').Object3D | undefined,
): void {
  if (selection.length === 0) {
    gizmo.detach()
    return
  }

  gizmo.setSpace(useEditorStore.getState().gizmoSpace)

  if (selection.length === 1) {
    const object = getObject3D(selection[0]!)
    if (!object) {
      gizmo.detach()
      return
    }
    object.updateMatrixWorld(true)
    gizmo.attach(object)
    return
  }
  pivot.syncCenter(selection, getObject3D)
  pivot.object.updateMatrixWorld(true)
  gizmo.attach(pivot.object)
}

function syncViewportCamera(engine: Engine): void {
  const { viewportCameraEntityId } = useEditorStore.getState()
  if (viewportCameraEntityId) {
    engine.backend.useSceneEntityCamera(viewportCameraEntityId)
  } else {
    engine.backend.useEditorViewportCamera()
  }
}

export const ViewportPanel = memo(function ViewportPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const marqueeRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const orbitRef = useRef<OrbitControls | null>(null)
  const cameraLookRef = useRef<ReturnType<typeof attachCameraLookControls> | null>(null)
  const gizmoRef = useRef<TransformControls | null>(null)
  const selectionPivotRef = useRef<SelectionTransformPivot | null>(null)
  const cameraGizmosRef = useRef<SceneCameraGizmos | null>(null)
  const lightGizmosRef = useRef<SceneLightGizmos | null>(null)
  const aabbGizmosRef = useRef<SceneAabbGizmos | null>(null)
  const selectionOutlineRef = useRef<SceneSelectionOutline | null>(null)
  const lastHandledFocusRequest = useRef(0)
  const dragStartTransform = useRef<ReturnType<typeof TransformComponent.schema.parse> | null>(null)
  const dragStartSnapshots = useRef<EntityDragSnapshot[]>([])
  const uniformScaleDragStart = useRef<THREE.Vector3 | null>(null)
  const gizmoPointerRef = useRef(false)

  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const selection = useEditorStore((s) => s.selection)
  const selectedIds = useMemo(
    () => selection.filter((id) => world?.hasEntity(id)),
    [selection, world, worldRevision],
  )
  const primary = primarySelection(selectedIds)
  const selectedIdSet = useMemo(() => new Set(selectedIds.map((id) => id.value)), [selectedIds])
  const showAabb = useEditorStore((s) => s.showAabb)
  const mode = useEditorStore((s) => s.mode)
  const transformTool = useEditorStore((s) => s.transformTool)
  const viewportCameraEntityId = useEditorStore((s) => s.viewportCameraEntityId)
  const focusSelectionRequest = useEditorStore((s) => s.focusSelectionRequest)
  const hierarchyFilterQuery = useEditorStore((s) => s.hierarchyFilterQuery)
  const hierarchyFilterMode = useEditorStore((s) => s.hierarchyFilterMode)
  const gizmoSpace = useEditorStore((s) => s.gizmoSpace)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new Engine({ canvas })
    engine.backend.setModelAssetResolver((path) => projectService.resolveModelAssetUrl(path))
    engine.backend.setModelResourceResolver((modelPath, resource) =>
      projectService.resolveModelResourceUrl(modelPath, resource),
    )
    engine.backend.setModelLoadPreparer((path) => projectService.prepareModelLoad(path))
    engineRef.current = engine

    const unsubscribeWorld = useEditorStore.subscribe((state, prev) => {
      if (state.world !== prev.world || state.worldRevision !== prev.worldRevision) {
        if (state.world) engine.setWorld(state.world)
      }
    })

    const editorCamera = engine.backend.getEditorCamera()
    const orbit = new OrbitControls(editorCamera, canvas)
    orbit.enableDamping = true
    applyOrbitToolMode(orbit, useEditorStore.getState().transformTool)
    orbitRef.current = orbit

    cameraLookRef.current = attachCameraLookControls(canvas, editorCamera, orbit, {
      isEnabled: () => {
        const { mode, viewportCameraEntityId } = useEditorStore.getState()
        const activeOrbit = orbitRef.current
        return mode === 'edit' && !viewportCameraEntityId && !!activeOrbit?.enabled
      },
    })

    const gizmo = new TransformControls(editorCamera, canvas)
    gizmo.setSpace('local')
    gizmo.setMode('translate')
    applyEditorTransformGizmoLayout(gizmo)
    gizmo.addEventListener('dragging-changed', (event) => {
      const { mode, viewportCameraEntityId: viewportId } = useEditorStore.getState()
      const canOrbit =
        mode === 'edit' &&
        !viewportId &&
        (useEditorStore.getState().transformTool === 'hand' || !(event.value as boolean))
      orbit.enabled = canOrbit
    })
    engine.backend.threeScene.add(gizmo.getHelper())
    gizmoRef.current = gizmo

    const selectionPivot = new SelectionTransformPivot()
    engine.backend.threeScene.add(selectionPivot.object)
    selectionPivotRef.current = selectionPivot

    cameraGizmosRef.current = new SceneCameraGizmos()
    lightGizmosRef.current = new SceneLightGizmos()
    aabbGizmosRef.current = new SceneAabbGizmos()
    aabbGizmosRef.current.attach(engine.backend.threeScene)
    selectionOutlineRef.current = new SceneSelectionOutline()

    const tick = () => {
      orbit.update()
      requestAnimationFrame(tick)
    }
    tick()

    engine.start()

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width > 0 && height > 0) {
        engine.backend.resize(width, height)
        cameraGizmosRef.current?.refreshProjections()
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    return () => {
      unsubscribeWorld()
      observer.disconnect()
      cameraLookRef.current?.dispose()
      cameraLookRef.current = null
      cameraGizmosRef.current?.dispose()
      cameraGizmosRef.current = null
      lightGizmosRef.current?.dispose()
      lightGizmosRef.current = null
      aabbGizmosRef.current?.dispose()
      aabbGizmosRef.current = null
      selectionOutlineRef.current?.dispose(engine.backend)
      selectionOutlineRef.current = null
      selectionPivotRef.current?.dispose()
      selectionPivotRef.current = null
      gizmo.dispose()
      orbit.dispose()
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !world) return
    engine.loadWorld(world, sceneDocument?.prototypes ?? {}, sceneDocument?.prefabs ?? {})
    syncViewportCamera(engine)

    const gizmo = gizmoRef.current
    const orbit = orbitRef.current
    if (gizmo) gizmo.camera = engine.backend.getActiveCamera()
    if (orbit) orbit.object = engine.backend.getEditorCamera()
  }, [world, sceneDocument])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !world) return

    syncViewportCamera(engine)

    const gizmo = gizmoRef.current
    const orbit = orbitRef.current
    if (gizmo) gizmo.camera = engine.backend.getActiveCamera()
    if (orbit) orbit.object = engine.backend.getEditorCamera()
  }, [viewportCameraEntityId, world])

  useLayoutEffect(() => {
    const engine = engineRef.current
    if (!engine || !world) return
    engine.setWorld(world)
  }, [world, worldRevision])

  useEffect(() => {
    const engine = engineRef.current
    const gizmo = gizmoRef.current
    const cameraGizmos = cameraGizmosRef.current
    const lightGizmos = lightGizmosRef.current
    const aabbGizmos = aabbGizmosRef.current
    const selectionOutline = selectionOutlineRef.current
    const selectionPivot = selectionPivotRef.current
    if (!engine || !world || !gizmo || !selectionPivot) return

    const getObject3D = (id: EntityId) => engine.backend.sync.getObject3D(id)

    if (!selectionPivot.isDragging()) {
      for (const id of selectedIds) {
        engine.backend.sync.syncEntityTransform(id)
      }
      refreshGizmo(gizmo, selectedIds, selectionPivot, getObject3D)
    }

    if (cameraGizmos) {
      cameraGizmos.sync(world, engine.backend.sync, {
        visible: mode === 'edit',
        selectedId: primary?.value ?? null,
        viewportCameraId: viewportCameraEntityId?.value ?? null,
        hideActiveViewportFrustum: !!viewportCameraEntityId,
      })
    }

    if (lightGizmos) {
      lightGizmos.sync(world, engine.backend.sync, {
        visible: mode === 'edit',
        selectedId: primary?.value ?? null,
      })
    }

    if (aabbGizmos) {
      aabbGizmos.sync(world, engine.backend.sync, {
        visible: mode === 'edit' && showAabb,
        selectedIds: selectedIdSet,
      })
    }

    if (selectionOutline) {
      selectionOutline.sync(engine.backend, engine.backend.sync, {
        visible: mode === 'edit' && selectedIds.length > 0,
        selectedIds: selectedIdSet,
      })
    }
  }, [world, worldRevision, selectedIds, selectedIdSet, mode, viewportCameraEntityId, showAabb, primary])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !world) return

    const { highlightedIds } = computeHierarchyFilterSets(
      world,
      hierarchyFilterQuery,
      hierarchyFilterMode,
    )
    engine.backend.setHierarchyFilterHighlight(
      hierarchyFilterQuery.trim() ? highlightedIds : null,
    )
  }, [world, worldRevision, hierarchyFilterQuery, hierarchyFilterMode])

  useEffect(() => {
    const engine = engineRef.current
    const gizmo = gizmoRef.current
    const orbit = orbitRef.current
    const selectionPivot = selectionPivotRef.current
    if (!engine || !gizmo || !orbit || !selectionPivot) return

    const isEdit = mode === 'edit'
    const usesEditorCamera = !viewportCameraEntityId
    const isHandTool = transformTool === 'hand'

    gizmo.getHelper().visible = isEdit && selectedIds.length > 0 && !isHandTool
    orbit.enabled = isEdit && usesEditorCamera

    if (selectedIds.length > 0 && !isHandTool && !selectionPivot.isDragging()) {
      refreshGizmo(gizmo, selectedIds, selectionPivot, (id) => engine.backend.sync.getObject3D(id))
    } else if (!selectedIds.length || isHandTool) {
      gizmo.detach()
    }
  }, [selectedIds, mode, world, transformTool, viewportCameraEntityId])

  useEffect(() => {
    const engine = engineRef.current
    const gizmo = gizmoRef.current
    const selectionPivot = selectionPivotRef.current
    if (!engine || !gizmo || !selectionPivot) return
    if (selectedIds.length === 0 || transformTool === 'hand' || selectionPivot.isDragging()) return

    refreshGizmo(gizmo, selectedIds, selectionPivot, (id) => engine.backend.sync.getObject3D(id))
  }, [gizmoSpace, selectedIds, transformTool])

  useEffect(() => {
    const gizmo = gizmoRef.current
    const orbit = orbitRef.current
    if (!gizmo || !orbit) return

    applyOrbitToolMode(orbit, transformTool)

    if (transformTool === 'hand') {
      gizmo.detach()
      return
    }

    gizmo.setMode(transformTool)
  }, [transformTool])

  useEffect(() => {
    const engine = engineRef.current
    const orbit = orbitRef.current
    if (!engine || !orbit) return
    if (
      focusSelectionRequest === 0 ||
      focusSelectionRequest === lastHandledFocusRequest.current
    ) {
      return
    }

    lastHandledFocusRequest.current = focusSelectionRequest

    const selected = useEditorStore.getState().selection.filter((id) => engine.backend.sync.getObject3D(id))
    if (selected.length === 0) return

    const camera = engine.backend.getEditorCamera()
    if (selected.length === 1) {
      const object = engine.backend.sync.getObject3D(selected[0]!)
      if (!object) return
      focusSelection(object, camera, orbit)
      return
    }

    focusSelectionBounds(selected, (id) => engine.backend.sync.getObject3D(id), camera, orbit)
  }, [focusSelectionRequest])

  useEffect(() => {
    const gizmo = gizmoRef.current
    if (!gizmo) return

    const onMouseDown = () => {
      gizmoPointerRef.current = true
      const { selection: currentSelection, world: w } = useEditorStore.getState()
      const engine = engineRef.current
      const selectionPivot = selectionPivotRef.current
      if (!engine || !w || !selectionPivot) return

      const ids = currentSelection.filter((id) => w.hasEntity(id))
      const getObject3D = (id: EntityId) => engine.backend.sync.getObject3D(id)

      if (ids.length > 1) {
        dragStartSnapshots.current = selectionPivot.beginDrag(ids, w, getObject3D)
        dragStartTransform.current = null

        if (shouldTrackUniformScaleDrag(gizmo.mode, gizmo.axis, useEditorStore.getState().uniformScaleLocked)) {
          uniformScaleDragStart.current = selectionPivot.object.scale.clone()
        } else {
          uniformScaleDragStart.current = null
        }
        return
      }

      const sel = primarySelection(ids)
      const obj = sel ? getObject3D(sel) : null
      dragStartSnapshots.current = []

      if (sel && w) {
        dragStartTransform.current = w.getComponent(sel, TransformComponent) ?? null
      }

      if (shouldTrackUniformScaleDrag(gizmo.mode, gizmo.axis, useEditorStore.getState().uniformScaleLocked) && obj) {
        uniformScaleDragStart.current = obj.scale.clone()
      } else {
        uniformScaleDragStart.current = null
      }
    }

    const onMouseUp = () => {
      gizmoPointerRef.current = false
      const w = useEditorStore.getState().world
      const selectionPivot = selectionPivotRef.current
      if (!w || !selectionPivot) return

      if (dragStartSnapshots.current.length > 0) {
        const snapshots = dragStartSnapshots.current
        selectionPivot.endDrag()
        const changes = snapshots
          .map((snapshot) => {
            const after = w.getComponent(snapshot.id, TransformComponent)
            if (!after) return null
            return { entityId: snapshot.id, before: snapshot.before, after }
          })
          .filter((change): change is NonNullable<typeof change> => !!change)

        if (changes.length > 0) {
          commitMultiTransformChange(changes)
        }

        dragStartSnapshots.current = []
        uniformScaleDragStart.current = null

        const engine = engineRef.current
        const activeGizmo = gizmoRef.current
        const pivot = selectionPivotRef.current
        if (engine && activeGizmo && pivot) {
          const ids = useEditorStore.getState().selection.filter((id) => w.hasEntity(id))
          refreshGizmo(activeGizmo, ids, pivot, (id) => engine.backend.sync.getObject3D(id))
        }
        return
      }

      const sel = primarySelection(useEditorStore.getState().selection)
      const before = dragStartTransform.current
      if (!sel || !before) return
      const after = w.getComponent(sel, TransformComponent)
      if (!after || transformsEqual(before, after)) {
        dragStartTransform.current = null
        uniformScaleDragStart.current = null
        return
      }

      commitTransformChange(sel, before, after)
      dragStartTransform.current = null
      uniformScaleDragStart.current = null
    }

    const onObjectChange = () => {
      if (!gizmo.dragging) return

      const { selection: currentSelection, world: w, snapEnabled } = useEditorStore.getState()
      const engine = engineRef.current
      const selectionPivot = selectionPivotRef.current
      if (!engine || !w || !selectionPivot) return

      const ids = currentSelection.filter((id) => w.hasEntity(id))
      const getObject3D = (id: EntityId) => engine.backend.sync.getObject3D(id)

      const uniformScaleLocked = useEditorStore.getState().uniformScaleLocked

      if (ids.length > 1) {
        if (gizmo.mode === 'scale' && uniformScaleDragStart.current) {
          applyScaleGizmoConstraint(
            selectionPivot.object,
            uniformScaleDragStart.current,
            gizmo.axis,
            uniformScaleLocked,
          )
        }

        if (snapEnabled && gizmo.mode === 'translate') {
          const snapState = selectionPivot.getSnapDragState()
          if (snapState) {
            applyAabbEdgeSnapToSelectionPivot(
              selectionPivot.object,
              ids,
              snapState.startBounds,
              snapState.startPivotWorld,
              w,
              getObject3D,
              gizmo.axis,
            )
          }
        }

        selectionPivot.applyDrag(w, getObject3D)
        useEditorStore.getState().setWorld(w)
        return
      }

      const sel = primarySelection(ids)
      const obj = sel ? getObject3D(sel) : null
      if (!sel || !obj) return

      if (gizmo.mode === 'scale' && uniformScaleDragStart.current) {
        applyScaleGizmoConstraint(obj, uniformScaleDragStart.current, gizmo.axis, uniformScaleLocked)
      }

      if (snapEnabled && gizmo.mode === 'translate') {
        applyAabbEdgeSnap(obj, sel, w, getObject3D, gizmo.axis)
      }

      w.addComponent(sel, TransformComponent, {
        position: [obj.position.x, obj.position.y, obj.position.z],
        rotation: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
        scale: [obj.scale.x, obj.scale.y, obj.scale.z],
      })
      useEditorStore.getState().setWorld(w)
    }

    gizmo.addEventListener('mouseDown', onMouseDown)
    gizmo.addEventListener('mouseUp', onMouseUp)
    gizmo.addEventListener('objectChange', onObjectChange)

    return () => {
      gizmo.removeEventListener('mouseDown', onMouseDown)
      gizmo.removeEventListener('mouseUp', onMouseUp)
      gizmo.removeEventListener('objectChange', onObjectChange)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const marquee = marqueeRef.current
    if (!canvas || !marquee) return

    const dragThresholdSq = 36
    let pointerDown = { x: 0, y: 0 }
    let dragging = false
    let isMarquee = false
    let marqueeAdditive = false
    let marqueeBaseSelection: EntityId[] = []

    const applyMarqueeSelection = (clientX: number, clientY: number) => {
      const engine = engineRef.current
      const canvas = canvasRef.current
      if (!engine || !canvas) return

      const picked = engine.backend.pickEntitiesInRect(
        pointerDown.x,
        pointerDown.y,
        clientX,
        clientY,
        canvas,
      )

      const store = useEditorStore.getState()
      if (marqueeAdditive) {
        store.setSelection(mergeSelection(marqueeBaseSelection, picked, true))
      } else {
        store.setSelection(picked)
      }
    }

    const hideMarquee = () => {
      marquee.style.display = 'none'
    }

    const updateMarquee = (x0: number, y0: number, x1: number, y1: number) => {
      const left = Math.min(x0, x1)
      const top = Math.min(y0, y1)
      const width = Math.abs(x1 - x0)
      const height = Math.abs(y1 - y0)
      marquee.style.display = 'block'
      marquee.style.left = `${left}px`
      marquee.style.top = `${top}px`
      marquee.style.width = `${width}px`
      marquee.style.height = `${height}px`
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const { mode, transformTool: tool } = useEditorStore.getState()
      if (mode !== 'edit' || tool === 'hand') return

      const gizmo = gizmoRef.current
      if (gizmo?.dragging || gizmo?.axis) return

      pointerDown = { x: event.clientX, y: event.clientY }
      dragging = true
      isMarquee = false
      marqueeAdditive = event.metaKey || event.ctrlKey || event.shiftKey
      marqueeBaseSelection = useEditorStore.getState().selection
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return

      const dx = event.clientX - pointerDown.x
      const dy = event.clientY - pointerDown.y
      if (!isMarquee && dx * dx + dy * dy > dragThresholdSq) {
        isMarquee = true
      }
      if (!isMarquee) return

      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      updateMarquee(
        pointerDown.x - rect.left,
        pointerDown.y - rect.top,
        event.clientX - rect.left,
        event.clientY - rect.top,
      )
      applyMarqueeSelection(event.clientX, event.clientY)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return
      dragging = false
      hideMarquee()

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }

      const { mode, transformTool: tool } = useEditorStore.getState()
      if (mode !== 'edit' || tool === 'hand') return

      const gizmo = gizmoRef.current
      if (gizmo?.dragging || gizmo?.axis || gizmoPointerRef.current) return

      const engine = engineRef.current
      if (!engine) return

      if (isMarquee) {
        applyMarqueeSelection(event.clientX, event.clientY)
        return
      }

      const dx = event.clientX - pointerDown.x
      const dy = event.clientY - pointerDown.y
      if (dx * dx + dy * dy > dragThresholdSq) return

      const pick = engine.backend.pickEntityAt(event.clientX, event.clientY, canvas)
      if (!pick.entityId) {
        useEditorStore.getState().setSelection([])
        return
      }
      useEditorStore.getState().selectEntity(
        pick.entityId,
        event.metaKey || event.ctrlKey || event.shiftKey,
      )
    }

    const onPointerCancel = (event: PointerEvent) => {
      dragging = false
      isMarquee = false
      hideMarquee()
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', background: '#111' }}
      />
      <div
        ref={marqueeRef}
        style={{
          display: 'none',
          position: 'absolute',
          pointerEvents: 'none',
          border: '1px solid #6af',
          background: 'rgba(100, 170, 255, 0.12)',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
})
