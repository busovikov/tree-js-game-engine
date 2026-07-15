import { memo, useMemo, useState } from 'react'
import {
  ColliderSchema,
  ColliderShapeSchema,
  DEFAULT_PHYSICS_MATERIAL_ID,
  MAX_PHYSICS_LAYERS,
  type Collider,
  type ColliderShape,
  type PhysicsProjectSettings,
} from '@haku/schema'
import { EDITOR_PHYSICS_CAPABILITIES } from '../physics/editor-physics-capabilities.js'
import { ColliderBakeDialog } from './ColliderBakeDialog.js'
import { NumberField } from './NumberField.js'
import { useEditorStore } from '../store/editor-store.js'
import { isBakeSourceStale } from '../viewport/collider-mesh-bake.js'
import { isResizableColliderShape } from '../viewport/scene-collider-resize-gizmo.js'
import './mesh-renderer-fields.css'

const SHAPE_OPTIONS: Array<{ value: ColliderShape; label: string }> = [
  { value: 'box', label: 'box' },
  { value: 'sphere', label: 'sphere' },
  { value: 'capsule', label: 'capsule' },
  { value: 'cylinder', label: 'cylinder' },
  { value: 'convexHull', label: 'convex hull' },
  { value: 'trimesh', label: 'trimesh' },
  { value: 'heightfield', label: 'heightfield' },
  { value: 'worldBoundary', label: 'world boundary' },
]

export function normalizeCollider(data: unknown): Collider {
  return ColliderSchema.parse(data)
}

export const ColliderFields = memo(function ColliderFields({
  value,
  onChange,
  disabled,
  physicsSettings,
  nonUniformScaleWarning,
  entityId,
  rigidBodyType,
  currentMeshRevision,
  onBake,
}: {
  value: Collider
  onChange?: (next: Collider) => void
  disabled?: boolean
  physicsSettings?: PhysicsProjectSettings
  nonUniformScaleWarning?: boolean
  entityId?: string
  rigidBodyType?: 'static' | 'dynamic' | 'kinematic'
  currentMeshRevision?: string
  onBake?: (mode: 'convexHull' | 'trimesh') => void
}) {
  const patch = (partial: Partial<Collider>) => onChange?.({ ...value, ...partial } as Collider)
  const [bakeDialogOpen, setBakeDialogOpen] = useState(false)
  const colliderResizeActive = useEditorStore((state) => state.colliderResizeActive)
  const setColliderResizeActive = useEditorStore((state) => state.setColliderResizeActive)
  const colliderBakeService = useEditorStore((state) => state.colliderBakeService)

  const bakeStale = useMemo(() => {
    const revision = currentMeshRevision
    if (!revision) return false
    const bakeSource =
      value.shape === 'convexHull' || value.shape === 'trimesh' ? value.bakeSource : undefined
    return isBakeSourceStale(bakeSource, revision)
  }, [currentMeshRevision, value])

  const materialOptions = Object.keys(physicsSettings?.materials ?? { [DEFAULT_PHYSICS_MATERIAL_ID]: {} })
  const selectedMaterialId = value.materialId || DEFAULT_PHYSICS_MATERIAL_ID

  const shapeOptions = useMemo(() => {
    const allowed = EDITOR_PHYSICS_CAPABILITIES.shapes.shapes
    const options = SHAPE_OPTIONS.filter((option) => allowed.has(option.value))
    if (!options.some((option) => option.value === value.shape)) {
      options.push({
        value: value.shape,
        label: `${value.shape} (unsupported)`,
      })
    }
    return options
  }, [value.shape])

  const setShape = (shape: ColliderShape) => {
    onChange?.(
      ColliderSchema.parse({
        shape,
        offset: value.offset,
        rotation: value.rotation,
        enabled: value.enabled,
        layer: value.layer,
        isTrigger: value.isTrigger,
        materialId: value.materialId,
      }),
    )
  }

  const patchVec3 = (key: 'offset', axis: 0 | 1 | 2, num: number) => {
    const next = [...value[key]] as [number, number, number]
    next[axis] = num
    patch({ [key]: next } as Partial<Collider>)
  }

  const patchHalfExtents = (axis: 0 | 1 | 2, num: number) => {
    if (value.shape !== 'box') return
    const next = [...value.halfExtents] as [number, number, number]
    next[axis] = Math.max(0.001, num)
    patch({ halfExtents: next })
  }

  return (
    <div className="mesh-renderer-fields">
      {nonUniformScaleWarning && (
        <div
          style={{ color: '#e6b84d', fontSize: 12, marginBottom: 8 }}
          title="Non-uniform Transform.scale is baked into collider size at spawn; runtime scale changes are not supported."
        >
          Non-uniform scale — physics uses baked collider sizes only.
        </div>
      )}

      {bakeStale && (
        <div style={{ color: '#e6b84d', fontSize: 12, marginBottom: 8 }}>
          Mesh changed since last bake — re-bake collider to match the render mesh.
        </div>
      )}

      <div className="mesh-renderer-fields__section">
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>Bake from viewport mesh</div>
        <p className="mesh-renderer-fields__hint" style={{ marginBottom: 8 }}>
          Render mesh ≠ physics shape. Bake creates a separate collider from visible geometry.
        </p>
        <button
          type="button"
          disabled={disabled || !colliderBakeService || !entityId}
          onClick={() => setBakeDialogOpen(true)}
        >
          Bake from mesh…
        </button>
      </div>

      {(value.shape === 'convexHull' || value.shape === 'trimesh') && (
        <div className="mesh-renderer-fields__section">
          <label className="mesh-field" title="Optional collision LOD mesh asset id (manual assign).">
            <span className="mesh-field__label">Collision mesh asset</span>
            <input
              className="mesh-field__input"
              value={value.bakeSource?.collisionMeshAsset ?? ''}
              disabled={disabled}
              onChange={(event) =>
                patch({
                  bakeSource: {
                    kind: value.bakeSource?.kind ?? 'meshRenderer',
                    ...value.bakeSource,
                    collisionMeshAsset: event.target.value.trim() || undefined,
                  },
                } as Partial<Collider>)
              }
            />
          </label>
        </div>
      )}

      {isResizableColliderShape(value.shape) && (
        <div className="mesh-renderer-fields__section">
          <label className="mesh-field mesh-field--checkbox">
            <input
              type="checkbox"
              aria-label="Resize collider in viewport"
              checked={colliderResizeActive}
              disabled={disabled}
              onChange={(event) => setColliderResizeActive(event.target.checked)}
            />
            <span className="mesh-field__label">Resize collider in viewport (scale tool)</span>
          </label>
        </div>
      )}

      <ColliderBakeDialog
        open={bakeDialogOpen}
        rigidBodyType={rigidBodyType}
        onClose={() => setBakeDialogOpen(false)}
        onConfirm={(mode) => {
          setBakeDialogOpen(false)
          onBake?.(mode)
        }}
      />

      <div className="mesh-renderer-fields__section">
        <label className="mesh-field" title="Primitive collider shape.">
          <span className="mesh-field__label">Shape</span>
          <select
            className="mesh-field__input"
            value={value.shape}
            disabled={disabled}
            onChange={(event) => setShape(ColliderShapeSchema.parse(event.target.value))}
          >
            {shapeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mesh-field mesh-field--checkbox" title="Disable collider without removing it.">
          <input
            type="checkbox"
            aria-label="Collider enabled"
            checked={value.enabled !== false}
            disabled={disabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          <span className="mesh-field__label">Enabled</span>
        </label>

        <label className="mesh-field mesh-field--checkbox" title="Sensor collider — overlap events without contact response.">
          <input
            type="checkbox"
            aria-label="Collider trigger"
            checked={value.isTrigger}
            disabled={disabled}
            onChange={(event) => patch({ isTrigger: event.target.checked })}
          />
          <span className="mesh-field__label">Trigger</span>
        </label>

        <label className="mesh-field" title="Physics layer index (0..15).">
          <span className="mesh-field__label">Layer</span>
          <select
            className="mesh-field__input"
            value={value.layer}
            disabled={disabled}
            onChange={(event) => patch({ layer: Number(event.target.value) })}
          >
            {Array.from({ length: MAX_PHYSICS_LAYERS }, (_, index) => (
              <option key={index} value={index}>
                {physicsSettings?.layers[index] ?? `Layer ${index}`}
              </option>
            ))}
          </select>
        </label>

        <label className="mesh-field" title="Project physics material asset.">
          <span className="mesh-field__label">Material</span>
          <select
            className="mesh-field__input"
            value={selectedMaterialId}
            disabled={disabled}
            onChange={(event) =>
              patch({
                materialId:
                  event.target.value === DEFAULT_PHYSICS_MATERIAL_ID ? '' : event.target.value,
              })
            }
          >
            {materialOptions.map((materialId) => (
              <option key={materialId} value={materialId}>
                {materialId}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mesh-renderer-fields__section">
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }} title="Local offset from entity origin.">
          offset
        </div>
        {value.offset.map((component, index) => (
          <NumberField
            key={`offset-${index}`}
            label={`offset[${index}]`}
            value={component}
            disabled={disabled}
            hint={`Collider offset component ${index}.`}
            onChange={(num) => patchVec3('offset', index as 0 | 1 | 2, num)}
          />
        ))}
      </div>

      {value.shape === 'box' && (
        <div className="mesh-renderer-fields__section">
          <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }} title="Box half-extents in local space.">
            halfExtents
          </div>
          {value.halfExtents.map((component, index) => (
            <NumberField
              key={`halfExtents-${index}`}
              label={`halfExtents[${index}]`}
              value={component}
              min={0.001}
              step={0.05}
              disabled={disabled}
              hint={`Box half-extent component ${index}.`}
              onChange={(num) => patchHalfExtents(index as 0 | 1 | 2, num)}
            />
          ))}
        </div>
      )}

      {value.shape === 'sphere' && (
        <div className="mesh-renderer-fields__section">
          <NumberField
            label="radius"
            value={value.radius}
            min={0.001}
            step={0.05}
            disabled={disabled}
            hint="Sphere collider radius."
            onChange={(radius) => patch({ radius: Math.max(0.001, radius) })}
          />
        </div>
      )}

      {(value.shape === 'capsule' || value.shape === 'cylinder') && (
        <div className="mesh-renderer-fields__section">
          <NumberField
            label="radius"
            value={value.radius}
            min={0.001}
            step={0.05}
            disabled={disabled}
            hint={`${value.shape} collider radius.`}
            onChange={(radius) => patch({ radius: Math.max(0.001, radius) })}
          />
          <NumberField
            label="halfHeight"
            value={value.halfHeight}
            min={0}
            step={0.05}
            disabled={disabled}
            hint={`${value.shape} half-height along local Y.`}
            onChange={(halfHeight) => patch({ halfHeight: Math.max(0, halfHeight) })}
          />
        </div>
      )}

      {value.shape === 'convexHull' && (
        <div className="mesh-renderer-fields__section" style={{ color: '#aaa', fontSize: 12 }}>
          Convex hull: {value.points.length / 3} points
          {value.points.length / 3 > (EDITOR_PHYSICS_CAPABILITIES.shapes.maxConvexHullVertices ?? 1024)
            ? ' (exceeds recommended max)'
            : ''}
        </div>
      )}

      {value.shape === 'trimesh' && (
        <div className="mesh-renderer-fields__section" style={{ color: '#aaa', fontSize: 12 }}>
          Trimesh: {value.vertices.length / 3} vertices, {value.indices.length / 3} triangles (static only).
        </div>
      )}
    </div>
  )
})
