import { memo } from 'react'
import { ColliderSchema, CollidersSchema, type Collider, type Colliders } from '@haku/schema'
import { ColliderFields, normalizeCollider } from './ColliderFields.js'
import './mesh-renderer-fields.css'

export function normalizeColliders(data: unknown): Colliders {
  return CollidersSchema.parse(data)
}

export const CollidersFields = memo(function CollidersFields({
  value,
  onChange,
  disabled,
  physicsSettings,
  nonUniformScaleWarning,
}: {
  value: Colliders
  onChange?: (next: Colliders) => void
  disabled?: boolean
  physicsSettings?: import('@haku/schema').PhysicsProjectSettings
  nonUniformScaleWarning?: boolean
}) {
  const patch = (partial: Partial<Colliders>) => onChange?.({ ...value, ...partial } as Colliders)

  const updateCollider = (index: number, next: Collider) => {
    const colliders = [...value.colliders]
    colliders[index] = next
    patch({ colliders })
  }

  const addCollider = () => {
    patch({ colliders: [...value.colliders, ColliderSchema.parse({ shape: 'box' })] })
  }

  const removeCollider = (index: number) => {
    patch({ colliders: value.colliders.filter((_, itemIndex) => itemIndex !== index) })
  }

  return (
    <div className="mesh-renderer-fields">
      <label className="mesh-field mesh-field--checkbox">
        <input
          type="checkbox"
          aria-label="Colliders enabled"
          checked={value.enabled !== false}
          disabled={disabled}
          onChange={(event) => patch({ enabled: event.target.checked })}
        />
        <span className="mesh-field__label">Enabled</span>
      </label>

      <p className="mesh-renderer-fields__hint" style={{ margin: '8px 0' }}>
        Multiple colliders on one entity when hierarchy compound is not enough.
      </p>

      {value.colliders.map((collider, index) => (
        <div key={`collider-${index}`} className="mesh-renderer-fields__section">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#aaa', fontSize: 12 }}>Collider {index + 1}</span>
            <button type="button" disabled={disabled} onClick={() => removeCollider(index)}>
              Remove
            </button>
          </div>
          <ColliderFields
            value={normalizeCollider(collider)}
            disabled={disabled}
            physicsSettings={physicsSettings}
            nonUniformScaleWarning={nonUniformScaleWarning}
            onChange={(next) => updateCollider(index, next)}
          />
        </div>
      ))}

      <button type="button" disabled={disabled} onClick={addCollider}>
        Add collider
      </button>
    </div>
  )
})
