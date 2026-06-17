import { memo, useCallback, useEffect, useMemo, useState } from 'react'
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
import type { ComponentType, EntityId } from '@haku/core'
import type { Camera, Light, MeshMaterial, MeshRenderer, Transform } from '@haku/schema'
import { useEditorStore } from '../store/editor-store.js'
import { commitSceneEdit } from '../commands/scene-history.js'
import { CameraFields, normalizeCamera } from '../components/CameraFields.js'
import { LightFields, normalizeLight } from '../components/LightFields.js'
import { TransformFields } from '../components/TransformFields.js'
import { MeshRendererFields } from '../components/MeshRendererFields.js'
import { buildMaterialMixedValues } from '../components/MaterialPropertiesPanel.js'
import { TagFields } from '../components/TagFields.js'
import { SchemaFields } from '../components/SchemaFields.js'
import { normalizeMeshRenderer, defaultGeometryParams } from '@haku/schema'
import {
  commonComponentTypes,
  mergeBooleans,
  mergeStrings,
  mergeVec3,
  type MixedBool,
} from '../inspector/multi-edit.js'
import * as THREE from 'three'
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

function quatToEulerDegrees(q: [number, number, number, number]): [number, number, number] {
  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(q[0], q[1], q[2], q[3]),
    'XYZ',
  )
  return [
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z),
  ]
}

function eulerAxisToQuat(axis: 0 | 1 | 2, degrees: number, current: [number, number, number, number]): [number, number, number, number] {
  const euler = quatToEulerDegrees(current)
  euler[axis] = degrees
  const rotation = new THREE.Euler(
    THREE.MathUtils.degToRad(euler[0]),
    THREE.MathUtils.degToRad(euler[1]),
    THREE.MathUtils.degToRad(euler[2]),
    'XYZ',
  )
  const q = new THREE.Quaternion().setFromEuler(rotation)
  return [q.x, q.y, q.z, q.w]
}

export const InspectorPanel = memo(function InspectorPanel() {
  const selection = useEditorStore((s) => s.selection)
  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const mode = useEditorStore((s) => s.mode)

  void worldRevision

  const selectedIds = useMemo(
    () => selection.filter((id) => world?.hasEntity(id)),
    [selection, world, worldRevision],
  )

  const canEdit = selectedIds.length > 0 && !!world && mode === 'edit'
  const isMulti = selectedIds.length > 1

  const entityNames = useMemo(
    () => selectedIds.map((id) => world?.getEntityName(id) ?? 'Entity'),
    [selectedIds, world, worldRevision],
  )
  const mergedName = mergeStrings(entityNames)
  const headerLabel = isMulti
    ? `${selectedIds.length} entities selected`
    : (mergedName ?? 'Entity')

  const entityTags = useMemo(() => {
    if (!world || selectedIds.length !== 1) return []
    const id = selectedIds[0]!
    return world.hasComponent(id, TagComponent)
      ? (world.getComponent(id, TagComponent)?.tags ?? [])
      : []
  }, [selectedIds, world, worldRevision])

  const staticMixed: MixedBool = useMemo(() => {
    if (!world || selectedIds.length === 0) return null
    return mergeBooleans(
      selectedIds.map((id) =>
        world.hasComponent(id, StaticComponent)
          ? (world.getComponent(id, StaticComponent)?.isStatic ?? false)
          : false,
      ),
    )
  }, [selectedIds, world, worldRevision])

  const transforms = useMemo(() => {
    if (!world) return []
    return selectedIds
      .map((id) => world.getComponent(id, TransformComponent))
      .filter((value): value is Transform => !!value)
  }, [selectedIds, world, worldRevision])

  const transformDisplay = transforms[0] ?? DEFAULT_TRANSFORM
  const mixedPosition = useMemo(
    () => mergeVec3(transforms.map((value) => value.position as [number, number, number])),
    [transforms],
  )
  const mixedScale = useMemo(
    () => mergeVec3(transforms.map((value) => value.scale as [number, number, number])),
    [transforms],
  )
  const mixedRotation = useMemo(
    () =>
      mergeVec3(
        transforms.map((value) => quatToEulerDegrees(value.rotation as [number, number, number, number])),
      ),
    [transforms],
  )

  const commonTypes = useMemo(
    () => (world ? commonComponentTypes(world, selectedIds) : []),
    [world, selectedIds, worldRevision],
  )

  const [nameDraft, setNameDraft] = useState(headerLabel)
  useEffect(() => {
    setNameDraft(headerLabel)
  }, [selectedIds.map((id) => id.value).join(','), headerLabel])

  const forEachSelected = useCallback(
    (edit: (id: EntityId, draftWorld: NonNullable<typeof world>) => void) => {
      if (!canEdit || !world) return
      commitSceneEdit((draft) => {
        for (const id of selectedIds) {
          if (draft.world.hasEntity(id)) edit(id, draft.world)
        }
      })
    },
    [canEdit, selectedIds, world],
  )

  const updateEntityName = useCallback(
    (name: string) => {
      if (!canEdit || isMulti || !world || selectedIds.length !== 1) return
      const id = selectedIds[0]!
      const trimmed = name.trim()
      if (!trimmed) {
        setNameDraft(world.getEntityName(id) ?? 'Entity')
        return
      }
      if (trimmed === world.getEntityName(id)) return
      commitSceneEdit((draft) => {
        draft.world.setEntityName(id, trimmed)
      })
    },
    [canEdit, isMulti, selectedIds, world],
  )

  const updateStatic = useCallback(
    (checked: boolean) => {
      forEachSelected((id, draftWorld) => {
        if (checked) {
          draftWorld.addComponent(id, StaticComponent, { isStatic: true })
          return
        }
        if (draftWorld.hasComponent(id, StaticComponent)) {
          draftWorld.removeComponent(id, StaticComponent)
        }
      })
    },
    [forEachSelected],
  )

  const applyTransformAxis = useCallback(
    (
      field: 'position' | 'scale' | 'rotation',
      axis: 0 | 1 | 2,
      value: number,
    ) => {
      forEachSelected((id, draftWorld) => {
        const current = draftWorld.getComponent(id, TransformComponent) ?? DEFAULT_TRANSFORM
        const next = structuredClone(current)
        if (field === 'position') {
          next.position[axis] = value
        } else if (field === 'scale') {
          next.scale[axis] = value
        } else {
          next.rotation = eulerAxisToQuat(axis, value, current.rotation as [number, number, number, number])
        }
        draftWorld.addComponent(id, TransformComponent, next)
      })
    },
    [forEachSelected],
  )

  const applyUniformScaleAxis = useCallback(
    (axis: 0 | 1 | 2, value: number) => {
      forEachSelected((id, draftWorld) => {
        const current = draftWorld.getComponent(id, TransformComponent) ?? DEFAULT_TRANSFORM
        const next = structuredClone(current)
        const scale = current.scale as [number, number, number]
        const base = scale[axis]
        if (base === 0) {
          next.scale[axis] = value
        } else {
          const ratio = value / base
          next.scale = [scale[0] * ratio, scale[1] * ratio, scale[2] * ratio]
        }
        draftWorld.addComponent(id, TransformComponent, next)
      })
    },
    [forEachSelected],
  )

  const updateTransform = useCallback(
    (after: Transform) => {
      forEachSelected((id, draftWorld) => {
        draftWorld.addComponent(id, TransformComponent, after)
      })
    },
    [forEachSelected],
  )

  const resetTransform = useCallback(() => {
    updateTransform(DEFAULT_TRANSFORM)
  }, [updateTransform])

  const updateCamera = useCallback(
    (after: Camera) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, CameraComponent)) {
          draftWorld.addComponent(id, CameraComponent, after)
        }
      })
    },
    [forEachSelected],
  )

  const updateLight = useCallback(
    (after: Light) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, LightComponent)) {
          draftWorld.addComponent(id, LightComponent, after)
        }
      })
    },
    [forEachSelected],
  )

  const updateMeshRenderer = useCallback(
    (after: MeshRenderer) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, MeshRendererComponent)) {
          draftWorld.addComponent(id, MeshRendererComponent, after)
        }
      })
    },
    [forEachSelected],
  )

  const patchMeshRenderer = useCallback(
    (patch: (current: MeshRenderer) => MeshRenderer) => {
      forEachSelected((id, draftWorld) => {
        if (!draftWorld.hasComponent(id, MeshRendererComponent)) return
        const current = normalizeMeshRenderer(draftWorld.getComponent(id, MeshRendererComponent))
        draftWorld.addComponent(id, MeshRendererComponent, patch(current))
      })
    },
    [forEachSelected],
  )

  const updateTags = useCallback(
    (tags: string[]) => {
      if (!canEdit || selectedIds.length !== 1 || !world) return
      const id = selectedIds[0]!
      const normalized = tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .filter((tag, index, list) => list.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index)

      commitSceneEdit((draft) => {
        if (normalized.length === 0) {
          if (draft.world.hasComponent(id, TagComponent)) {
            draft.world.removeComponent(id, TagComponent)
          }
          return
        }
        draft.world.addComponent(id, TagComponent, { tags: normalized })
      })
    },
    [canEdit, selectedIds, world],
  )

  const addComponent = useCallback(
    (component: ComponentType) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, component)) return
        const defaults =
          'defaults' in component && typeof component.defaults === 'function'
            ? component.defaults()
            : component.schema.parse({})
        draftWorld.addComponent(id, component, defaults)
      })
    },
    [forEachSelected],
  )

  const removeComponent = useCallback(
    (component: ComponentType) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, component)) {
          draftWorld.removeComponent(id, component)
        }
      })
    },
    [forEachSelected],
  )

  if (!world || selectedIds.length === 0) {
    return (
      <div className="haku-inspector haku-inspector--empty">
        Select an entity
      </div>
    )
  }

  const otherComponents = commonTypes.filter((typeId) => !HIDDEN_COMPONENTS.has(typeId))
  const showTransform = commonTypes.includes('Transform')

  return (
    <div className="haku-inspector">
      <div className="haku-inspector__entity-header">
        <input
          type="text"
          className="haku-inspector__name-input"
          value={nameDraft}
          disabled={!canEdit || isMulti}
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
            checked={staticMixed === true}
            ref={(input) => {
              if (input) input.indeterminate = staticMixed === null
            }}
            disabled={!canEdit}
            onChange={(event) => updateStatic(event.target.checked)}
          />
          Static
        </label>
      </div>

      {!isMulti && (
        <div className="haku-inspector__tags">
          <TagFields
            key={selectedIds[0]!.value}
            tags={entityTags}
            disabled={!canEdit}
            onChange={updateTags}
          />
        </div>
      )}

      <InspectorSeparator />

      {showTransform && (
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
            value={transformDisplay}
            mixedPosition={isMulti ? mixedPosition : undefined}
            mixedRotation={isMulti ? mixedRotation : undefined}
            mixedScale={isMulti ? mixedScale : undefined}
            disabled={mode === 'play'}
            onChange={isMulti ? undefined : updateTransform}
            onPositionAxisChange={
              isMulti ? (axis, value) => applyTransformAxis('position', axis, value) : undefined
            }
            onRotationAxisChange={
              isMulti ? (axis, value) => applyTransformAxis('rotation', axis, value) : undefined
            }
            onScaleAxisChange={
              isMulti ? (axis, value) => applyTransformAxis('scale', axis, value) : undefined
            }
            onUniformScaleAxisChange={(axis, value) => applyUniformScaleAxis(axis, value)}
          />
        </section>
      )}

      <InspectorSeparator />

      {otherComponents.map((typeId) => {
        const key = typeId as keyof typeof COMPONENT_MAP
        if (!(key in COMPONENT_MAP)) return null
        const type = getCoreComponent(typeId)
        if (!type) return null

        const component = COMPONENT_MAP[key]
        const targets = selectedIds.filter((entityId) => world.hasComponent(entityId, component))
        if (targets.length === 0) return null

        const values = targets
          .map((id) => world.getComponent(id, type))
          .filter((value): value is NonNullable<typeof value> => value !== undefined && typeof value === 'object')

        if (values.length === 0) return null
        const data = values[0]!

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
                mixedGeometryType={
                  isMulti
                    ? mergeStrings(values.map((value) => normalizeMeshRenderer(value).geometryType))
                    : undefined
                }
                mixedModelAsset={
                  isMulti
                    ? mergeStrings(values.map((value) => normalizeMeshRenderer(value).modelAsset))
                    : undefined
                }
                {...(isMulti
                  ? buildMaterialMixedValues(values.map((value) => normalizeMeshRenderer(value).material))
                  : {})}
                onChange={isMulti ? undefined : updateMeshRenderer}
                onPatch={
                  isMulti
                    ? (patch) => {
                        patchMeshRenderer((current) => ({ ...current, ...patch }))
                      }
                    : undefined
                }
                onMaterialPatch={
                  isMulti
                    ? (patch: Partial<MeshMaterial>) => {
                        patchMeshRenderer((current) => ({
                          ...current,
                          material: { ...current.material, ...patch },
                        }))
                      }
                    : undefined
                }
                onGeometryTypeChange={
                  isMulti
                    ? (geometryType) => {
                        patchMeshRenderer((current) => ({
                          ...current,
                          geometryType,
                          geometryParams: defaultGeometryParams(geometryType),
                          modelAsset: geometryType === 'ModelGeometry' ? current.modelAsset : '',
                        }))
                      }
                    : undefined
                }
                onModelAssetChange={
                  isMulti ? (modelAsset) => patchMeshRenderer((current) => ({ ...current, modelAsset })) : undefined
                }
                onGeometryParamChange={
                  isMulti
                    ? (paramKey, num) => {
                        patchMeshRenderer((current) => ({
                          ...current,
                          geometryParams: { ...current.geometryParams, [paramKey]: num },
                        }))
                      }
                    : undefined
                }
              />
            ) : (
              <SchemaFields
                componentId={key}
                data={data as Record<string, unknown>}
                disabled={mode === 'play'}
                onChange={(next) =>
                  forEachSelected((id, draftWorld) => {
                    draftWorld.addComponent(id, COMPONENT_MAP[key], next)
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
              const allHave = selectedIds.every((entityId) => world.hasComponent(entityId, component))
              return (
                <button
                  key={id}
                  type="button"
                  disabled={allHave}
                  className={`haku-inspector__add-btn${allHave ? ' haku-inspector__add-btn--present' : ''}`}
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
