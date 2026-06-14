import { memo, useCallback, useEffect, useState } from 'react'
import {
  CameraComponent,
  LightComponent,
  MeshRendererComponent,
  ScriptRefComponent,
  StaticComponent,
  TagComponent,
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
import { TagFields } from '../components/TagFields.js'
import { SchemaFields } from '../components/SchemaFields.js'
import { normalizeMeshRenderer } from '@haku/schema'
import './inspector-panel.css'

const DEFAULT_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
}

const COMPONENT_MAP = {
  Transform: TransformComponent,
  Camera: CameraComponent,
  Light: LightComponent,
  MeshRenderer: MeshRendererComponent,
  ScriptRef: ScriptRefComponent,
} as const

const HIDDEN_COMPONENTS = new Set(['Tag', 'Static', 'Transform'])

const ADDABLE_COMPONENTS = [
  { id: 'Camera' as const, component: CameraComponent, label: 'Camera' },
  { id: 'Light' as const, component: LightComponent, label: 'Light' },
  { id: 'MeshRenderer' as const, component: MeshRendererComponent, label: 'Mesh Renderer' },
]

function InspectorSeparator() {
  return <hr className="haku-inspector__separator" />
}

export const InspectorPanel = memo(function InspectorPanel() {
  const selection = useEditorStore((s) => s.selection)
  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const mode = useEditorStore((s) => s.mode)

  void worldRevision

  const canEdit = !!selection && !!world && mode === 'edit'
  const componentTypes = selection && world ? world.getComponentTypes(selection) : []
  const entityName = selection && world ? (world.getEntityName(selection) ?? 'Entity') : ''
  const entityTags =
    selection && world && world.hasComponent(selection, TagComponent)
      ? (world.getComponent(selection, TagComponent)?.tags ?? [])
      : []
  const isStatic =
    !!selection &&
    !!world &&
    world.hasComponent(selection, StaticComponent) &&
    (world.getComponent(selection, StaticComponent)?.isStatic ?? false)
  const transform =
    selection && world ? world.getComponent(selection, TransformComponent) : undefined

  const [nameDraft, setNameDraft] = useState(entityName)
  useEffect(() => {
    setNameDraft(entityName)
  }, [selection?.value, entityName])

  const updateEntityName = useCallback(
    (name: string) => {
      if (!canEdit || !selection || !world) return
      const trimmed = name.trim()
      if (!trimmed) {
        setNameDraft(world.getEntityName(selection) ?? 'Entity')
        return
      }
      if (trimmed === world.getEntityName(selection)) return
      commitSceneEdit((draft) => {
        draft.world.setEntityName(selection, trimmed)
      })
    },
    [canEdit, selection, world],
  )

  const updateStatic = useCallback(
    (checked: boolean) => {
      if (!canEdit || !selection || !world) return
      commitSceneEdit((draft) => {
        if (checked) {
          draft.world.addComponent(selection, StaticComponent, { isStatic: true })
          return
        }
        if (draft.world.hasComponent(selection, StaticComponent)) {
          draft.world.removeComponent(selection, StaticComponent)
        }
      })
    },
    [canEdit, selection, world],
  )

  const updateTransform = useCallback(
    (after: Transform) => {
      if (!canEdit || !selection || !world) return
      commitSceneEdit((draft) => {
        draft.world.addComponent(selection, TransformComponent, after)
      })
    },
    [canEdit, selection, world],
  )

  const resetTransform = useCallback(() => {
    updateTransform(DEFAULT_TRANSFORM)
  }, [updateTransform])

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

  const updateTags = useCallback(
    (tags: string[]) => {
      if (!canEdit || !selection || !world) return
      const normalized = tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .filter((tag, index, list) => list.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index)

      commitSceneEdit((draft) => {
        if (normalized.length === 0) {
          if (draft.world.hasComponent(selection, TagComponent)) {
            draft.world.removeComponent(selection, TagComponent)
          }
          return
        }
        draft.world.addComponent(selection, TagComponent, { tags: normalized })
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
      <div className="haku-inspector haku-inspector--empty">
        Select an entity
      </div>
    )
  }

  const otherComponents = world
    .getComponentTypes(selection)
    .filter((typeId) => !HIDDEN_COMPONENTS.has(typeId))

  return (
    <div className="haku-inspector">
      <div className="haku-inspector__entity-header">
        <input
          type="text"
          className="haku-inspector__name-input"
          value={nameDraft}
          disabled={!canEdit}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={() => updateEntityName(nameDraft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
        <label className="haku-inspector__static">
          <input
            type="checkbox"
            checked={isStatic}
            disabled={!canEdit}
            onChange={(event) => updateStatic(event.target.checked)}
          />
          Static
        </label>
      </div>

      <div className="haku-inspector__tags">
        <TagFields
          key={selection.value}
          tags={entityTags}
          disabled={!canEdit}
          onChange={updateTags}
        />
      </div>

      <InspectorSeparator />

      {transform && (
        <section className="haku-inspector__section">
          <div className="haku-inspector__section-header">
            <h4 className="haku-inspector__section-title">Transform</h4>
            <button
              type="button"
              className="haku-inspector__section-action"
              title="Reset transform"
              disabled={mode === 'play'}
              onClick={resetTransform}
            >
              Reset
            </button>
          </div>
          <TransformFields
            value={transform}
            disabled={mode === 'play'}
            onChange={updateTransform}
          />
        </section>
      )}

      <InspectorSeparator />

      {otherComponents.map((typeId) => {
        const key = typeId as keyof typeof COMPONENT_MAP
        if (!(key in COMPONENT_MAP)) return null
        const type = getCoreComponent(typeId)
        const data = type ? world.getComponent(selection, type) : undefined
        if (!data || typeof data !== 'object') return null

        return (
          <section key={typeId} className="haku-inspector__section">
            <div className="haku-inspector__section-header">
              <h4 className="haku-inspector__section-title">{typeId}</h4>
              <button
                type="button"
                className="haku-inspector__remove-btn"
                disabled={!canEdit}
                onClick={() => removeComponent(COMPONENT_MAP[key])}
                title={`Remove ${typeId}`}
              >
                Remove
              </button>
            </div>

            {key === 'Camera' ? (
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
        <section className="haku-inspector__add-section">
          <h4 className="haku-inspector__add-title">Add Component</h4>
          <div className="haku-inspector__add-buttons">
            {ADDABLE_COMPONENTS.map(({ id, component, label }) => {
              const present = componentTypes.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  disabled={present}
                  className={`haku-inspector__add-btn${present ? ' haku-inspector__add-btn--present' : ''}`}
                  onClick={() => addComponent(component)}
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
