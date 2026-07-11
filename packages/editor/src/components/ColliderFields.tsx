import { memo } from 'react'
import {
  ColliderSchema,
  ColliderShapeSchema,
  type Collider,
  type ColliderShape,
} from '@haku/schema'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

export function normalizeCollider(data: unknown): Collider {
  return ColliderSchema.parse(data)
}

export const ColliderFields = memo(function ColliderFields({
  value,
  onChange,
  disabled,
}: {
  value: Collider
  onChange?: (next: Collider) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<Collider>) => onChange?.({ ...value, ...partial } as Collider)

  const setShape = (shape: ColliderShape) => {
    onChange?.(
      ColliderSchema.parse({
        shape,
        offset: value.offset,
        rotation: value.rotation,
        isStatic: value.isStatic,
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
      <div className="mesh-renderer-fields__section">
        <label className="mesh-field" title="Primitive collider shape.">
          <span className="mesh-field__label">Shape</span>
          <select
            className="mesh-field__input"
            value={value.shape}
            disabled={disabled}
            onChange={(event) => setShape(ColliderShapeSchema.parse(event.target.value))}
          >
            <option value="box">box</option>
            <option value="sphere">sphere</option>
            <option value="capsule">capsule</option>
          </select>
        </label>

        <label className="mesh-field mesh-field--checkbox" title="Static bodies do not move under simulation.">
          <input
            type="checkbox"
            aria-label="Collider static"
            checked={value.isStatic}
            disabled={disabled}
            onChange={(event) => patch({ isStatic: event.target.checked })}
          />
          <span className="mesh-field__label">Static</span>
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

      {value.shape === 'capsule' && (
        <div className="mesh-renderer-fields__section">
          <NumberField
            label="radius"
            value={value.radius}
            min={0.001}
            step={0.05}
            disabled={disabled}
            hint="Capsule collider radius."
            onChange={(radius) => patch({ radius: Math.max(0.001, radius) })}
          />
          <NumberField
            label="halfHeight"
            value={value.halfHeight}
            min={0}
            step={0.05}
            disabled={disabled}
            hint="Capsule half-height along local Y."
            onChange={(halfHeight) => patch({ halfHeight: Math.max(0, halfHeight) })}
          />
        </div>
      )}
    </div>
  )
})
