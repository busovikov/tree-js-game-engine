import { memo, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Engine } from '@haku/engine'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { TransformComponent } from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'
import { SetTransformCommand, recordCommand } from '../commands/world-commands.js'
import { transformsEqual } from '../commands/scene-history.js'
import { mutateWorld } from '../commands/world-mutations.js'
import { focusSelection } from '../viewport/focus-selection.js'
import { applyEditorTransformGizmoLayout, applyUniformScaleDamping } from '../viewport/transform-gizmo-config.js'

function refreshGizmo(
  gizmo: TransformControls,
  object: import('three').Object3D | undefined,
): void {
  if (!object) {
    gizmo.detach()
    return
  }
  gizmo.attach(object)
  object.updateMatrixWorld(true)
}

export const ViewportPanel = memo(function ViewportPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const orbitRef = useRef<OrbitControls | null>(null)
  const gizmoRef = useRef<TransformControls | null>(null)
  const dragStartTransform = useRef<ReturnType<typeof TransformComponent.schema.parse> | null>(null)
  const uniformScaleDragStart = useRef<THREE.Vector3 | null>(null)

  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const selection = useEditorStore((s) => s.selection)
  const mode = useEditorStore((s) => s.mode)
  const transformTool = useEditorStore((s) => s.transformTool)
  const focusSelectionRequest = useEditorStore((s) => s.focusSelectionRequest)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new Engine({ canvas })
    engineRef.current = engine

    const camera = engine.backend.getActiveCamera()
    const orbit = new OrbitControls(camera, canvas)
    orbit.enableDamping = true
    orbitRef.current = orbit

    const gizmo = new TransformControls(camera, canvas)
    gizmo.setSpace('local')
    gizmo.setMode('translate')
    applyEditorTransformGizmoLayout(gizmo)
    gizmo.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !(event.value as boolean)
    })
    engine.backend.threeScene.add(gizmo.getHelper())
    gizmoRef.current = gizmo

    const tick = () => {
      orbit.update()
      requestAnimationFrame(tick)
    }
    tick()

    engine.start()

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width > 0 && height > 0) engine.backend.resize(width, height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    return () => {
      observer.disconnect()
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
    const camera = engine.backend.getActiveCamera()
    const gizmo = gizmoRef.current
    const orbit = orbitRef.current
    if (gizmo) gizmo.camera = camera
    if (orbit) orbit.object = camera
  }, [world, sceneDocument])

  useEffect(() => {
    const engine = engineRef.current
    const gizmo = gizmoRef.current
    if (!engine || !world || !gizmo) return

    engine.backend.sync.update(world)

    if (selection) {
      engine.backend.sync.syncEntityTransform(selection)
      refreshGizmo(gizmo, engine.backend.sync.getObject3D(selection))
    }
  }, [world, worldRevision, selection])

  useEffect(() => {
    const engine = engineRef.current
    const gizmo = gizmoRef.current
    const orbit = orbitRef.current
    if (!engine || !gizmo || !orbit) return

    const isEdit = mode === 'edit'
    gizmo.getHelper().visible = isEdit && !!selection
    orbit.enabled = isEdit

    if (selection) {
      refreshGizmo(gizmo, engine.backend.sync.getObject3D(selection))
    } else {
      gizmo.detach()
    }
  }, [selection, mode, world])

  useEffect(() => {
    gizmoRef.current?.setMode(transformTool)
  }, [transformTool])

  useEffect(() => {
    const engine = engineRef.current
    const orbit = orbitRef.current
    if (!engine || !orbit || !selection || focusSelectionRequest === 0) return

    const object = engine.backend.sync.getObject3D(selection)
    const camera = engine.backend.getActiveCamera()
    if (!object || !(camera instanceof THREE.PerspectiveCamera)) return

    focusSelection(object, camera, orbit)
  }, [focusSelectionRequest, selection])

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

      mutateWorld(() => {})
      recordCommand(new SetTransformCommand(sel, before, after))
      dragStartTransform.current = null
      uniformScaleDragStart.current = null
    }

    const onObjectChange = () => {
      // Ignore programmatic transform updates from inspector/sync — only live-drag the gizmo.
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
      const { mode } = useEditorStore.getState()
      if (mode !== 'edit') return

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
