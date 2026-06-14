import { memo, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Engine } from '@haku/engine'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { TransformComponent } from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'
import { commitTransformChange, transformsEqual } from '../commands/scene-history.js'
import { computeHierarchyFilterSets } from '../hierarchy/entity-filter.js'
import { focusSelection } from '../viewport/focus-selection.js'
import { applyEditorTransformGizmoLayout, applyUniformScaleDamping } from '../viewport/transform-gizmo-config.js'
import { applyOrbitToolMode } from '../viewport/viewport-orbit.js'
import { attachCameraLookControls } from '../viewport/viewport-camera-look.js'
import { SceneCameraGizmos } from '../viewport/scene-camera-gizmos.js'
import { SceneLightGizmos } from '../viewport/scene-light-gizmos.js'

function refreshGizmo(
  gizmo: TransformControls,
  object: import('three').Object3D | undefined,
): void {
  if (!object) {
    gizmo.detach()
    return
  }
  object.updateMatrixWorld(true)
  gizmo.attach(object)
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
  const engineRef = useRef<Engine | null>(null)
  const orbitRef = useRef<OrbitControls | null>(null)
  const cameraLookRef = useRef<ReturnType<typeof attachCameraLookControls> | null>(null)
  const gizmoRef = useRef<TransformControls | null>(null)
  const cameraGizmosRef = useRef<SceneCameraGizmos | null>(null)
  const lightGizmosRef = useRef<SceneLightGizmos | null>(null)
  const lastHandledFocusRequest = useRef(0)
  const dragStartTransform = useRef<ReturnType<typeof TransformComponent.schema.parse> | null>(null)
  const uniformScaleDragStart = useRef<THREE.Vector3 | null>(null)

  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const selection = useEditorStore((s) => s.selection)
  const mode = useEditorStore((s) => s.mode)
  const transformTool = useEditorStore((s) => s.transformTool)
  const viewportCameraEntityId = useEditorStore((s) => s.viewportCameraEntityId)
  const focusSelectionRequest = useEditorStore((s) => s.focusSelectionRequest)
  const hierarchyFilterQuery = useEditorStore((s) => s.hierarchyFilterQuery)
  const hierarchyFilterMode = useEditorStore((s) => s.hierarchyFilterMode)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new Engine({ canvas })
    engineRef.current = engine

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

    cameraGizmosRef.current = new SceneCameraGizmos()
    lightGizmosRef.current = new SceneLightGizmos()

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
      observer.disconnect()
      cameraLookRef.current?.dispose()
      cameraLookRef.current = null
      cameraGizmosRef.current?.dispose()
      cameraGizmosRef.current = null
      lightGizmosRef.current?.dispose()
      lightGizmosRef.current = null
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

  useEffect(() => {
    const engine = engineRef.current
    const gizmo = gizmoRef.current
    const cameraGizmos = cameraGizmosRef.current
    const lightGizmos = lightGizmosRef.current
    if (!engine || !world || !gizmo) return

    engine.backend.sync.update(world)

    if (selection) {
      engine.backend.sync.syncEntityTransform(selection)
      refreshGizmo(gizmo, engine.backend.sync.getObject3D(selection))
    }

    if (cameraGizmos) {
      cameraGizmos.sync(world, engine.backend.sync, {
        visible: mode === 'edit',
        selectedId: selection?.value ?? null,
        viewportCameraId: viewportCameraEntityId?.value ?? null,
        hideActiveViewportFrustum: !!viewportCameraEntityId,
      })
    }

    if (lightGizmos) {
      lightGizmos.sync(world, engine.backend.sync, {
        visible: mode === 'edit',
        selectedId: selection?.value ?? null,
      })
    }
  }, [world, worldRevision, selection, mode, viewportCameraEntityId])

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
    if (!engine || !gizmo || !orbit) return

    const isEdit = mode === 'edit'
    const usesEditorCamera = !viewportCameraEntityId
    const isHandTool = transformTool === 'hand'

    gizmo.getHelper().visible = isEdit && !!selection && !isHandTool
    orbit.enabled = isEdit && usesEditorCamera

    if (selection && !isHandTool) {
      refreshGizmo(gizmo, engine.backend.sync.getObject3D(selection))
    } else {
      gizmo.detach()
    }
  }, [selection, mode, world, transformTool, viewportCameraEntityId])

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

    const selected = useEditorStore.getState().selection
    if (!selected) return

    const object = engine.backend.sync.getObject3D(selected)
    const camera = engine.backend.getEditorCamera()
    if (!object) return

    focusSelection(object, camera, orbit)
  }, [focusSelectionRequest])

  useEffect(() => {
    const gizmo = gizmoRef.current
    if (!gizmo) return

    const onMouseDown = () => {
      const sel = useEditorStore.getState().selection
      const w = useEditorStore.getState().world
      const obj = sel ? engineRef.current?.backend.sync.getObject3D(sel) : null

      if (sel && w) {
        dragStartTransform.current = w.getComponent(sel, TransformComponent) ?? null
      }

      if (gizmo.mode === 'scale' && gizmo.axis === 'XYZ' && obj) {
        uniformScaleDragStart.current = obj.scale.clone()
      } else {
        uniformScaleDragStart.current = null
      }
    }

    const onMouseUp = () => {
      const sel = useEditorStore.getState().selection
      const w = useEditorStore.getState().world
      const before = dragStartTransform.current
      if (!sel || !w || !before) return
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

      const sel = useEditorStore.getState().selection
      const w = useEditorStore.getState().world
      const obj = sel ? engineRef.current?.backend.sync.getObject3D(sel) : null
      if (!sel || !w || !obj) return

      if (gizmo.mode === 'scale' && gizmo.axis === 'XYZ' && uniformScaleDragStart.current) {
        applyUniformScaleDamping(obj, uniformScaleDragStart.current)
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
    if (!canvas) return

    let pointerDown = { x: 0, y: 0 }

    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY }
    }

    const onPointerUp = (event: PointerEvent) => {
      const { mode, transformTool: tool } = useEditorStore.getState()
      if (mode !== 'edit' || tool === 'hand') return

      const gizmo = gizmoRef.current
      if (gizmo?.dragging || gizmo?.axis) return

      const dx = event.clientX - pointerDown.x
      const dy = event.clientY - pointerDown.y
      if (dx * dx + dy * dy > 100) return

      const engine = engineRef.current
      if (!engine) return

      const pick = engine.backend.pickEntityAt(event.clientX, event.clientY, canvas)
      useEditorStore.getState().setSelection(pick.entityId)
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', background: '#111' }}
    />
  )
})
