import { memo, useCallback } from 'react'
import {
  CameraComponent,
  LightComponent,
  MeshRendererComponent,
  ScriptRefComponent,
  TransformComponent,
  getCoreComponent,
} from '@haku/core'
import type { ComponentType } from '@haku/core'
import type { Camera, Light, MeshRenderer, Transform } from '@haku/schema'
import { useEditorStore } from '../store/editor-store.js'
import { commitSceneEdit } from '../commands/scene-history.js'
import { CameraFields, normalizeCamera } from '../components/CameraFields.js'
import { LightFields, normalizeLight } from '../components/LightFields.js'
import { TransformFields } from '../components/TransformFields.js'
import { MeshRendererFields } from '../components/MeshRendererFields.js'
import { SchemaFields } from '../components/SchemaFields.js'
import { normalizeMeshRenderer } from '@haku/schema'

const COMPONENT_MAP = {
  Transform: TransformComponent,
  Camera: CameraComponent,
  Light: LightComponent,
  MeshRenderer: MeshRendererComponent,
  ScriptRef: ScriptRefComponent,
} as const

const ADDABLE_COMPONENTS = [
  { id: 'Camera' as const, component: CameraComponent, label: 'Camera' },
  { id: 'Light' as const, component: LightComponent, label: 'Light' },
  { id: 'MeshRenderer' as const, component: MeshRendererComponent, label: 'Mesh Renderer' },
]

export const InspectorPanel = memo(function InspectorPanel() {
  const selection = useEditorStore((s) => s.selection)
  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const mode = useEditorStore((s) => s.mode)

  void worldRevision

  const canEdit = !!selection && !!world && mode === 'edit'
  const componentTypes = selection && world ? world.getComponentTypes(selection) : []

  const updateTransform = useCallback(
    (after: Transform) => {
      if (!canEdit || !selection || !world) return
      commitSceneEdit((draft) => {
        draft.world.addComponent(selection, TransformComponent, after)
      })
    },
    [canEdit, selection, world],
  )

  const updateCamera = useCallback(
    (after: Camera) => {
      if (!canEdit || !selection || !world) return
      commitSceneEdit((draft) => {
        draft.world.addComponent(selection, CameraComponent, after)
      })
    },
    [canEdit, selection, world],
  )

  const updateLight = useCallback(
    (after: Light) => {
      if (!canEdit || !selection || !world) return
      commitSceneEdit((draft) => {
        draft.world.addComponent(selection, LightComponent, after)
      })
    },
    [canEdit, selection, world],
  )

  const updateMeshRenderer = useCallback(
    (after: MeshRenderer) => {
      if (!canEdit || !selection || !world) return
      commitSceneEdit((draft) => {
        draft.world.addComponent(selection, MeshRendererComponent, after)
      })
    },
    [canEdit, selection, world],
  )

  const addComponent = useCallback(
    (component: ComponentType) => {
      if (!canEdit || !selection || !world) return
      if (world.hasComponent(selection, component)) return

      commitSceneEdit((draft) => {
        const defaults =
          'defaults' in component && typeof component.defaults === 'function'
            ? component.defaults()
            : component.schema.parse({})
        draft.world.addComponent(selection, component, defaults)
      })
    },
    [canEdit, selection, world],
  )

  const removeComponent = useCallback(
    (component: ComponentType) => {
      if (!canEdit || !selection || !world) return
      commitSceneEdit((draft) => {
        draft.world.removeComponent(selection, component)
      })
    },
    [canEdit, selection, world],
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

        const canRemove = key !== 'Transform'

        return (
          <section key={typeId} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h4 style={{ fontSize: 12, color: '#aaa', margin: 0, flex: 1 }}>{typeId}</h4>
              {canRemove && (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => removeComponent(COMPONENT_MAP[key])}
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    background: '#333',
                    color: '#aaa',
                    border: '1px solid #555',
                    borderRadius: 3,
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                  title={`Remove ${typeId}`}
                >
                  Remove
                </button>
              )}
            </div>

            {key === 'Transform' ? (
              <TransformFields
                value={data as Transform}
                disabled={mode === 'play'}
                onChange={updateTransform}
              />
            ) : key === 'Camera' ? (
              <CameraFields
                value={normalizeCamera(data)}
                disabled={mode === 'play'}
                onChange={updateCamera}
              />
            ) : key === 'Light' ? (
              <LightFields
                value={normalizeLight(data)}
                disabled={mode === 'play'}
                onChange={updateLight}
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
                onChange={(next) =>
                  commitSceneEdit((draft) => {
                    draft.world.addComponent(selection, COMPONENT_MAP[key], next)
                  })
                }
              />
            )}
          </section>
        )
      })}

      {canEdit && (
        <section style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid #333' }}>
          <h4 style={{ fontSize: 12, color: '#aaa', margin: '0 0 8px' }}>Add Component</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ADDABLE_COMPONENTS.map(({ id, component, label }) => {
              const present = componentTypes.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  disabled={present}
                  onClick={() => addComponent(component)}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    background: present ? '#2a2a35' : '#333',
                    color: present ? '#666' : '#ddd',
                    border: '1px solid #444',
                    borderRadius: 4,
                    cursor: present ? 'default' : 'pointer',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
})

export { getCoreComponent }
