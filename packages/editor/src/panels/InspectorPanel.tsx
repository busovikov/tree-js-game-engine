import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CameraComponent,
  ColliderComponent,
  LightComponent,
  MeshRendererComponent,
  ScriptRefComponent,
  TagComponent,
  TransformComponent,
  PhysicsControllerComponent,
  RigidBodyComponent,
  PhysicsAreaComponent,
  AnimatableBodyComponent,
  PhysicsJointComponent,
  CollidersComponent,
  getCoreComponent,
} from '@haku/core'
import type { ComponentType, EntityId } from '@haku/core'
import type {
  AnimatableBody,
  Camera,
  Collider,
  Light,
  MeshMaterial,
  MeshRenderer,
  PhysicsArea,
  PhysicsController,
  PhysicsJoint,
  Colliders,
  RigidBody,
  Transform,
} from '@haku/schema'
import { ColliderSchema, isNonUniformScale, resolveActiveCameraId } from '@haku/schema'
import { sanitizeComponentDataForPersistence } from '@haku/serializer'
import { commitActiveSceneCamera } from '../commands/active-scene-camera.js'
import { useEditorStore } from '../store/editor-store.js'
import { commitSceneEdit } from '../commands/scene-history.js'
import { CameraFields, normalizeCamera } from '../components/CameraFields.js'
import { LightFields, normalizeLight } from '../components/LightFields.js'
import { TransformFields } from '../components/TransformFields.js'
import { teleportEntitiesToAuthoredTransform } from '../viewport/play-mode-physics-access.js'
import { MeshRendererFields } from '../components/MeshRendererFields.js'
import { buildMaterialMixedValues } from '../components/MaterialPropertiesPanel.js'
import { TagFields } from '../components/TagFields.js'
import { ColliderFields, normalizeCollider } from '../components/ColliderFields.js'
import { RigidBodyFields, normalizeRigidBody } from '../components/RigidBodyFields.js'
import { PhysicsAreaFields, normalizePhysicsArea } from '../components/PhysicsAreaFields.js'
import { AnimatableBodyFields, normalizeAnimatableBody } from '../components/AnimatableBodyFields.js'
import { PhysicsControllerFields, normalizePhysicsController } from '../components/PhysicsControllerFields.js'
import { PhysicsJointFields, normalizePhysicsJoint } from '../components/PhysicsJointFields.js'
import { CollidersFields, normalizeColliders } from '../components/CollidersFields.js'
import { EDITOR_PHYSICS_CAPABILITIES } from '../physics/editor-physics-capabilities.js'
import { currentMeshRevision, type ColliderBakeMode } from '../viewport/collider-mesh-bake.js'
import { SchemaFields } from '../components/SchemaFields.js'
import { InspectorComponentSection } from '../components/InspectorComponentSection.js'
import { AddComponentMenu } from '../components/AddComponentMenu.js'
import { normalizeMeshRenderer, normalizeMeshMaterial, defaultGeometryParams, isComponentEnabled, withComponentEnabled } from '@haku/schema'
import { eulerAxisToQuat, quatToEulerDegrees } from '../transform/euler-degrees.js'
import {
  commonComponentTypes,
  mergeBooleans,
  mergeStrings,
  mergeVec3,
  type MixedBool,
} from '../inspector/multi-edit.js'
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
  Collider: ColliderComponent,
  RigidBody: RigidBodyComponent,
  PhysicsArea: PhysicsAreaComponent,
  AnimatableBody: AnimatableBodyComponent,
  PhysicsJoint: PhysicsJointComponent,
  Colliders: CollidersComponent,
  PhysicsController: PhysicsControllerComponent,
} as const

const HIDDEN_COMPONENTS = new Set(['Tag', 'Static', 'Transform'])

const ADDABLE_COMPONENTS = [
  { id: 'Camera' as const, component: CameraComponent, label: 'Camera' },
  { id: 'Light' as const, component: LightComponent, label: 'Light' },
  { id: 'MeshRenderer' as const, component: MeshRendererComponent, label: 'Mesh Renderer' },
  { id: 'Collider' as const, component: ColliderComponent, label: 'Collider' },
  { id: 'RigidBody' as const, component: RigidBodyComponent, label: 'Rigid Body' },
  { id: 'PhysicsArea' as const, component: PhysicsAreaComponent, label: 'Physics Area' },
  { id: 'AnimatableBody' as const, component: AnimatableBodyComponent, label: 'Animatable Body' },
  { id: 'PhysicsJoint' as const, component: PhysicsJointComponent, label: 'Physics Joint' },
  { id: 'Colliders' as const, component: CollidersComponent, label: 'Colliders' },
  { id: 'PhysicsController' as const, component: PhysicsControllerComponent, label: 'Physics Controller' },
]

function InspectorSeparator() {
  return <hr className="haku-inspector__separator" />
}

export const InspectorPanel = memo(function InspectorPanel() {
  const selection = useEditorStore((s) => s.selection)
  const world = useEditorStore((s) => s.world)
  const worldRevision = useEditorStore((s) => s.worldRevision)
  const mode = useEditorStore((s) => s.mode)
  const sceneDocument = useEditorStore((s) => s.sceneDocument)
  const componentClipboard = useEditorStore((s) => s.componentClipboard)
  const setComponentClipboard = useEditorStore((s) => s.setComponentClipboard)

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  void worldRevision

  const selectedIds = useMemo(
    () => selection.filter((id) => world?.hasEntity(id)),
    [selection, world, worldRevision],
  )

  const canEdit = selectedIds.length > 0 && !!world && mode === 'edit'
  /** Variant B: Transform stays editable in play; pose pushes through resetBodyState. */
  const canEditTransform = selectedIds.length > 0 && !!world && (mode === 'edit' || mode === 'play')
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

  const colliderNonUniformScale = useMemo(() => {
    if (!world || selectedIds.length !== 1) return false
    const id = selectedIds[0]!
    if (!world.hasComponent(id, ColliderComponent)) return false
    const transform = world.getComponent(id, TransformComponent)
    return transform ? isNonUniformScale(transform.scale as [number, number, number]) : false
  }, [selectedIds, world, worldRevision])

  const selectedMeshRevision = useMemo(() => {
    if (!world || selectedIds.length !== 1) return undefined
    return currentMeshRevision(world, selectedIds[0]!)
  }, [selectedIds, world, worldRevision])

  const selectedRigidBodyType = useMemo(() => {
    if (!world || selectedIds.length !== 1) return undefined
    return world.getComponent(selectedIds[0]!, RigidBodyComponent)?.type
  }, [selectedIds, world, worldRevision])

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

  const forEachSelectedTransform = useCallback(
    (edit: (id: EntityId, draftWorld: NonNullable<typeof world>) => void) => {
      if (!canEditTransform || !world) return
      commitSceneEdit((draft) => {
        for (const id of selectedIds) {
          if (draft.world.hasEntity(id)) edit(id, draft.world)
        }
      })
      if (mode === 'play') {
        const liveWorld = useEditorStore.getState().world
        if (liveWorld) {
          teleportEntitiesToAuthoredTransform(liveWorld, selectedIds)
        }
      }
    },
    [canEditTransform, mode, selectedIds, world],
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

  const applyTransformAxis = useCallback(
    (
      field: 'position' | 'scale' | 'rotation',
      axis: 0 | 1 | 2,
      value: number,
    ) => {
      forEachSelectedTransform((id, draftWorld) => {
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
    [forEachSelectedTransform],
  )

  const applyUniformScaleAxis = useCallback(
    (axis: 0 | 1 | 2, value: number) => {
      forEachSelectedTransform((id, draftWorld) => {
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
    [forEachSelectedTransform],
  )

  const updateTransform = useCallback(
    (after: Transform) => {
      forEachSelectedTransform((id, draftWorld) => {
        draftWorld.addComponent(id, TransformComponent, after)
      })
    },
    [forEachSelectedTransform],
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

  const updateCollider = useCallback(
    (after: Collider) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, ColliderComponent)) {
          draftWorld.addComponent(id, ColliderComponent, after)
        }
      })
    },
    [forEachSelected],
  )

  const bakeColliderFromMesh = useCallback(
    (mode: ColliderBakeMode) => {
      if (!world || selectedIds.length !== 1) return
      const id = selectedIds[0]!
      const service = useEditorStore.getState().colliderBakeService
      if (!service) return

      const current = world.getComponent(id, ColliderComponent)
      const collisionMeshAsset =
        current && (current.shape === 'convexHull' || current.shape === 'trimesh')
          ? current.bakeSource?.collisionMeshAsset
          : undefined

      const result = service.bakeFromEntity(id, mode, {
        collisionMeshAsset,
        maxConvexHullVertices: EDITOR_PHYSICS_CAPABILITIES.shapes.maxConvexHullVertices,
      })
      if (!result) {
        console.warn('Collider bake failed — no mesh geometry found in viewport.')
        return
      }

      for (const warning of result.warnings) {
        console.warn(warning)
      }

      commitSceneEdit((draft) => {
        const existing = draft.world.getComponent(id, ColliderComponent)
        const base = existing ?? ColliderSchema.parse({ shape: mode })
        if (mode === 'convexHull') {
          draft.world.addComponent(
            id,
            ColliderComponent,
            ColliderSchema.parse({
              ...base,
              shape: 'convexHull',
              points: result.points ?? [],
              bakeSource: result.bakeSource,
            }),
          )
          return
        }

        draft.world.addComponent(
          id,
          ColliderComponent,
          ColliderSchema.parse({
            ...base,
            shape: 'trimesh',
            vertices: result.vertices ?? [],
            indices: result.indices ?? [],
            bakeSource: result.bakeSource,
          }),
        )
      })
    },
    [selectedIds, world],
  )

  const updateRigidBody = useCallback(
    (after: RigidBody) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, RigidBodyComponent)) {
          draftWorld.addComponent(id, RigidBodyComponent, after)
        }
      })
    },
    [forEachSelected],
  )

  const updatePhysicsArea = useCallback(
    (after: PhysicsArea) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, PhysicsAreaComponent)) {
          draftWorld.addComponent(id, PhysicsAreaComponent, after)
        }
      })
    },
    [forEachSelected],
  )

  const updateAnimatableBody = useCallback(
    (after: AnimatableBody) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, AnimatableBodyComponent)) {
          draftWorld.addComponent(id, AnimatableBodyComponent, after)
        }
      })
    },
    [forEachSelected],
  )

  const updatePhysicsController = useCallback(
    (after: PhysicsController) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, PhysicsControllerComponent)) {
          draftWorld.addComponent(id, PhysicsControllerComponent, after)
        }
      })
    },
    [forEachSelected],
  )

  const updatePhysicsJoint = useCallback(
    (after: PhysicsJoint) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, PhysicsJointComponent)) {
          draftWorld.addComponent(id, PhysicsJointComponent, after)
        }
      })
    },
    [forEachSelected],
  )

  const updateColliders = useCallback(
    (after: Colliders) => {
      forEachSelected((id, draftWorld) => {
        if (draftWorld.hasComponent(id, CollidersComponent)) {
          draftWorld.addComponent(id, CollidersComponent, after)
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

  const toggleSectionCollapsed = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }, [])

  const copyComponentData = useCallback(
    (typeId: string, data: Record<string, unknown>) => {
      const persistentData = sanitizeComponentDataForPersistence(typeId, data)
      setComponentClipboard({ typeId, data: structuredClone(persistentData) })
    },
    [setComponentClipboard],
  )

  const pasteComponentData = useCallback(
    (typeId: string, component: ComponentType) => {
      if (!componentClipboard || componentClipboard.typeId !== typeId) return
      forEachSelected((id, draftWorld) => {
        const parsed = component.schema.parse(componentClipboard.data)
        draftWorld.addComponent(id, component, parsed)
      })
    },
    [componentClipboard, forEachSelected],
  )

  const toggleComponentEnabled = useCallback(
    (component: ComponentType, enabled: boolean) => {
      forEachSelected((id, draftWorld) => {
        if (!draftWorld.hasComponent(id, component)) return
        const current = draftWorld.getComponent(id, component)
        if (!current || typeof current !== 'object') return
        draftWorld.addComponent(
          id,
          component,
          withComponentEnabled(current as Record<string, unknown>, enabled),
        )
      })
    },
    [forEachSelected],
  )

  const mergeComponentEnabled = useCallback(
    (component: ComponentType, targets: EntityId[]): MixedBool => {
      if (!world || targets.length === 0) return null
      return mergeBooleans(
        targets.map((id) => {
          const data = world.getComponent(id, component)
          return data ? isComponentEnabled(data) : true
        }),
      )
    },
    [world, worldRevision],
  )

  const addableItems = useMemo(() => {
    if (!world || selectedIds.length === 0) return []
    return ADDABLE_COMPONENTS.map(({ id, component, label }) => ({
      id,
      label,
      disabled: selectedIds.every((entityId) => world.hasComponent(entityId, component)),
    }))
  }, [world, selectedIds, worldRevision])

  const handleAddComponent = useCallback(
    (id: string) => {
      const entry = ADDABLE_COMPONENTS.find((item) => item.id === id)
      if (!entry) return
      addComponent(entry.component)
    },
    [addComponent],
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
      <div className="haku-inspector__scroll">
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
        <InspectorComponentSection
          title="Transform"
          collapsed={collapsedSections.Transform === true}
          canToggleEnabled={false}
          canDelete={false}
          disabled={!canEditTransform}
          onToggleCollapsed={() => toggleSectionCollapsed('Transform')}
          onCopy={() => copyComponentData('Transform', structuredClone(transformDisplay) as Record<string, unknown>)}
          onPaste={() => {
            if (!componentClipboard || componentClipboard.typeId !== 'Transform') return
            forEachSelectedTransform((id, draftWorld) => {
              draftWorld.addComponent(
                id,
                TransformComponent,
                TransformComponent.schema.parse(componentClipboard.data),
              )
            })
          }}
          canPaste={componentClipboard?.typeId === 'Transform'}
        >
          <div className="haku-inspector__section-toolbar">
            <button
              type="button"
              className="haku-inspector__section-action"
              title="Reset transform"
              disabled={!canEditTransform}
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
            disabled={!canEditTransform}
            onChange={isMulti ? undefined : updateTransform}
            onPositionAxisChange={(axis, value) => applyTransformAxis('position', axis, value)}
            onRotationAxisChange={(axis, value) => applyTransformAxis('rotation', axis, value)}
            onScaleAxisChange={
              isMulti ? (axis, value) => applyTransformAxis('scale', axis, value) : undefined
            }
            onUniformScaleAxisChange={(axis, value) => applyUniformScaleAxis(axis, value)}
          />
        </InspectorComponentSection>
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

        const isActiveCamera =
          key === 'Camera' &&
          sceneDocument &&
          targets.length === 1 &&
          resolveActiveCameraId(sceneDocument) === targets[0]!.value

        const enabledMixed = mergeComponentEnabled(component, targets)

        const isPhysicsController = key === 'PhysicsController'

        return (
          <InspectorComponentSection
            key={typeId}
            title={typeId}
            badge={
              isActiveCamera ? (
                <span className="haku-inspector__active-camera-badge">Active</span>
              ) : isPhysicsController ? (
                <span className="haku-inspector__implicit-collider-badge" title="Physics chassis box is built into Physics Controller">
                  Chassis
                </span>
              ) : undefined
            }
            collapsed={collapsedSections[typeId] === true}
            enabled={enabledMixed !== false}
            disabled={!canEdit}
            canPaste={componentClipboard?.typeId === typeId}
            onToggleCollapsed={() => toggleSectionCollapsed(typeId)}
            onToggleEnabled={() => toggleComponentEnabled(component, enabledMixed !== true)}
            onCopy={() => copyComponentData(typeId, structuredClone(data) as Record<string, unknown>)}
            onPaste={() => pasteComponentData(typeId, component)}
            onDelete={() => removeComponent(component)}
          >
            {key === 'Camera' ? (
              <>
                <CameraFields
                  value={normalizeCamera(data)}
                  disabled={mode === 'play'}
                  onChange={updateCamera}
                />
                {!isMulti && targets.length === 1 && !isActiveCamera && (
                  <button
                    type="button"
                    className="haku-inspector__active-camera-btn"
                    title="Make this camera the one the scene renders through in play mode."
                    disabled={!canEdit}
                    onClick={() => commitActiveSceneCamera(targets[0]!)}
                  >
                    Set as Active Camera
                  </button>
                )}
              </>
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
                          material: normalizeMeshMaterial({ ...current.material, ...patch }),
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
            ) : key === 'Collider' ? (
              <ColliderFields
                value={normalizeCollider(data)}
                physicsSettings={sceneDocument?.physicsSettings}
                disabled={mode === 'play'}
                nonUniformScaleWarning={colliderNonUniformScale}
                entityId={isMulti ? undefined : selectedIds[0]?.value}
                rigidBodyType={selectedRigidBodyType}
                currentMeshRevision={selectedMeshRevision}
                onBake={isMulti ? undefined : bakeColliderFromMesh}
                onChange={isMulti ? undefined : updateCollider}
              />
            ) : key === 'RigidBody' ? (
              <RigidBodyFields
                value={normalizeRigidBody(data)}
                disabled={mode === 'play'}
                onChange={isMulti ? undefined : updateRigidBody}
              />
            ) : key === 'PhysicsArea' ? (
              <PhysicsAreaFields
                value={normalizePhysicsArea(data)}
                physicsSettings={sceneDocument?.physicsSettings}
                disabled={mode === 'play'}
                onChange={isMulti ? undefined : updatePhysicsArea}
              />
            ) : key === 'AnimatableBody' ? (
              <AnimatableBodyFields
                value={normalizeAnimatableBody(data)}
                disabled={mode === 'play'}
                onChange={isMulti ? undefined : updateAnimatableBody}
              />
            ) : key === 'PhysicsController' ? (
              <PhysicsControllerFields
                value={normalizePhysicsController(data)}
                disabled={mode === 'play'}
                onChange={isMulti ? undefined : updatePhysicsController}
              />
            ) : key === 'PhysicsJoint' ? (
              <PhysicsJointFields
                value={normalizePhysicsJoint(data)}
                disabled={mode === 'play'}
                onChange={isMulti ? undefined : updatePhysicsJoint}
              />
            ) : key === 'Colliders' ? (
              <CollidersFields
                value={normalizeColliders(data)}
                physicsSettings={sceneDocument?.physicsSettings}
                disabled={mode === 'play'}
                nonUniformScaleWarning={colliderNonUniformScale}
                onChange={isMulti ? undefined : updateColliders}
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
          </InspectorComponentSection>
        )
      })}

      </div>

      {canEdit && (
        <div className="haku-inspector__footer">
          <AddComponentMenu items={addableItems} onAdd={handleAddComponent} />
        </div>
      )}
    </div>
  )
})

export { getCoreComponent }
