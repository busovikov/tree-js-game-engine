import { memo, useCallback } from 'react'
import {
  CameraComponent,
  LightComponent,
  MeshRendererComponent,
  ScriptRefComponent,
  TransformComponent,
  getCoreComponent,
} from '@haku/core'
import { useEditorStore } from '../store/editor-store.js'
import { commitSceneEdit } from '../commands/scene-history.js'
import { SchemaFields } from '../components/SchemaFields.js'
import { TransformFields } from '../components/TransformFields.js'
import { MeshRendererFields } from '../components/MeshRendererFields.js'
import { normalizeMeshRenderer, type MeshRenderer, type Transform } from '@haku/schema'

const COMPONENT_MAP = {
  Transform: TransformComponent,
  Camera: CameraComponent,
  Light: LightComponent,
  MeshRenderer: MeshRendererComponent,
  ScriptRef: ScriptRefComponent,
} as const

export const InspectorPanel = memo(function InspectorPanel() {
  const selection = useEditorStore((s) => s.selection)
  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const mode = useEditorStore((s) => s.mode)

  void worldRevision

  const updateTransform = useCallback(
    (after: Transform) => {
      if (!selection || !world || mode === 'play') return
      commitSceneEdit((draft) => {
        draft.world.addComponent(selection, TransformComponent, after)
      })
    },
    [selection, world, mode],
  )

  const updateComponent = useCallback(
    (componentId: keyof typeof COMPONENT_MAP, _before: Record<string, unknown>, after: Record<string, unknown>) => {
      if (!selection || !world || mode === 'play') return
      const type = COMPONENT_MAP[componentId]
      if (componentId === 'Transform') {
        commitSceneEdit((draft) => {
          draft.world.addComponent(
            selection,
            TransformComponent,
            after as ReturnType<typeof TransformComponent.schema.parse>,
          )
        })
        return
      }
      commitSceneEdit((draft) => {
        draft.world.addComponent(selection, type, after)
      })
    },
    [selection, world, mode],
  )

  const updateMeshRenderer = useCallback(
    (after: MeshRenderer) => {
      if (!selection || !world || mode === 'play') return
      commitSceneEdit((draft) => {
        draft.world.addComponent(selection, MeshRendererComponent, after)
      })
    },
    [selection, world, mode],
  )

  if (!selection || !world) {
    return (
      <div style={{ padding: 12, color: '#888', background: '#252530', height: '100%' }}>
        Select an entity
      </div>
    )
  }

  return (
    <div style={{ padding: 12, background: '#252530', height: '100%', overflow: 'auto', color: '#eee' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{world.getEntityName(selection)}</h3>

      {world.getComponentTypes(selection).map((typeId) => {
        const key = typeId as keyof typeof COMPONENT_MAP
        if (!(key in COMPONENT_MAP)) return null
        const type = getCoreComponent(typeId)
        const data = type ? world.getComponent(selection, type) : undefined
        if (!data || typeof data !== 'object') return null

        return (
          <section key={typeId} style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>{typeId}</h4>
            {key === 'Transform' ? (
              <TransformFields
                value={data as Transform}
                disabled={mode === 'play'}
                onChange={updateTransform}
              />
            ) : key === 'MeshRenderer' ? (
              <MeshRendererFields
                value={normalizeMeshRenderer(data)}
                disabled={mode === 'play'}
                onChange={updateMeshRenderer}
              />
            ) : (
              <SchemaFields
                componentId={key}
                data={data as Record<string, unknown>}
                disabled={mode === 'play'}
                onChange={(next) => updateComponent(key, data as Record<string, unknown>, next)}
              />
            )}
          </section>
        )
      })}
    </div>
  )
})

export { getCoreComponent }
