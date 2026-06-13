import { memo, useEffect, useRef } from 'react'
import { Engine } from '@haku/engine'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { TransformComponent } from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'
import { SetTransformCommand, executeCommand } from '../commands/world-commands.js'

export const ViewportPanel = memo(function ViewportPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const orbitRef = useRef<OrbitControls | null>(null)
  const gizmoRef = useRef<TransformControls | null>(null)
  const dragStartTransform = useRef<ReturnType<typeof TransformComponent.schema.parse> | null>(null)

  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const selection = useEditorStore((s) => s.selection)
  const mode = useEditorStore((s) => s.mode)

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
    if (gizmo) gizmo.camera = camera
  }, [world, worldRevision, sceneDocument])

  useEffect(() => {
    const engine = engineRef.current
    const gizmo = gizmoRef.current
    const orbit = orbitRef.current
    if (!engine || !gizmo || !orbit) return

    const isEdit = mode === 'edit'
    gizmo.getHelper().visible = isEdit && !!selection
    orbit.enabled = isEdit

    if (selection) {
      const obj = engine.backend.sync.getObject3D(selection)
      if (obj) gizmo.attach(obj)
      else gizmo.detach()
    } else {
      gizmo.detach()
    }
  }, [selection, mode, world])

  useEffect(() => {
    const gizmo = gizmoRef.current
    if (!gizmo) return

    const onMouseDown = () => {
      const sel = useEditorStore.getState().selection
      const w = useEditorStore.getState().world
      if (sel && w) {
        dragStartTransform.current = w.getComponent(sel, TransformComponent) ?? null
      }
    }

    const onMouseUp = () => {
      const sel = useEditorStore.getState().selection
      const w = useEditorStore.getState().world
      const before = dragStartTransform.current
      if (!sel || !w || !before) return
      const after = w.getComponent(sel, TransformComponent)
      if (after && JSON.stringify(before) !== JSON.stringify(after)) {
        executeCommand(new SetTransformCommand(sel, before, after))
      }
      dragStartTransform.current = null
    }

    const onObjectChange = () => {
      const sel = useEditorStore.getState().selection
      const w = useEditorStore.getState().world
      const obj = sel ? engineRef.current?.backend.sync.getObject3D(sel) : null
      if (!sel || !w || !obj) return
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

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', background: '#111' }}
    />
  )
})
