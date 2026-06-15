import { memo } from 'react'
import { CameraSchema, type Camera } from '@haku/schema'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

export function normalizeCamera(data: unknown): Camera {
  return CameraSchema.parse(data)
}

export const CameraFields = memo(function CameraFields({
  value,
  onChange,
  disabled,
}: {
  value: Camera
  onChange: (next: Camera) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<Camera>) => onChange({ ...value, ...partial })

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <NumberField
          label="FOV"
          value={value.fov}
          min={1}
          max={179}
          step={1}
          disabled={disabled}
          hint="Vertical field of view in degrees."
          onChange={(fov) => patch({ fov })}
        />
        <NumberField
          label="Near"
          value={value.near}
          min={0.001}
          step={0.01}
          disabled={disabled}
          hint="Near clipping plane distance."
          onChange={(near) => patch({ near: Math.max(0.001, near) })}
        />
        <NumberField
          label="Far"
          value={value.far}
          min={value.near + 0.01}
          step={1}
          disabled={disabled}
          hint="Far clipping plane distance."
          onChange={(far) => patch({ far: Math.max(value.near + 0.01, far) })}
        />
      </div>

      <div className="mesh-renderer-fields__section">
        <label className="mesh-field mesh-field--checkbox" title="Use orthographic projection instead of perspective.">
          <input
            type="checkbox"
            checked={!!value.ortho}
            disabled={disabled}
            onChange={(e) => patch({ ortho: e.target.checked })}
          />
          Orthographic
        </label>
        {value.ortho && (
          <NumberField
            label="Ortho size"
            value={value.orthoSize ?? 10}
            min={0.01}
            step={0.1}
            disabled={disabled}
            hint="Half-height of the orthographic view volume."
            onChange={(orthoSize) => patch({ orthoSize })}
          />
        )}
      </div>
    </div>
  )
})
