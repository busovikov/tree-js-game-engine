import { memo } from 'react'
import {
  MAX_PHYSICS_LAYERS,
  PhysicsAreaSchema,
  type PhysicsArea,
  type PhysicsProjectSettings,
} from '@haku/schema'
import './mesh-renderer-fields.css'

export function normalizePhysicsArea(data: unknown): PhysicsArea {
  return PhysicsAreaSchema.parse(data)
}

export const PhysicsAreaFields = memo(function PhysicsAreaFields({
  value,
  onChange,
  disabled,
  physicsSettings,
}: {
  value: PhysicsArea
  onChange?: (next: PhysicsArea) => void
  disabled?: boolean
  physicsSettings?: PhysicsProjectSettings
}) {
  const patch = (partial: Partial<PhysicsArea>) => onChange?.({ ...value, ...partial } as PhysicsArea)

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <label className="mesh-field mesh-field--checkbox" title="Disable the area without removing it.">
          <input
            type="checkbox"
            aria-label="Physics area enabled"
            checked={value.enabled !== false}
            disabled={disabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          <span className="mesh-field__label">Enabled</span>
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

        <label
          className="mesh-field mesh-field--checkbox"
          title="Other areas and bodies can detect this area."
        >
          <input
            type="checkbox"
            aria-label="Physics area monitorable"
            checked={value.monitorable}
            disabled={disabled}
            onChange={(event) => patch({ monitorable: event.target.checked })}
          />
          <span className="mesh-field__label">Monitorable</span>
        </label>

        <label
          className="mesh-field mesh-field--checkbox"
          title="This area detects overlaps with other bodies and areas."
        >
          <input
            type="checkbox"
            aria-label="Physics area monitoring"
            checked={value.monitoring}
            disabled={disabled}
            onChange={(event) => patch({ monitoring: event.target.checked })}
          />
          <span className="mesh-field__label">Monitoring</span>
        </label>
      </div>

      <div className="mesh-renderer-fields__section">
        <div
          style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}
          title="Replaces world gravity for dynamic bodies inside the area."
        >
          Gravity override (m/s²)
        </div>
        <p className="mesh-renderer-fields__hint" style={{ marginBottom: 8 }}>
          Optional directional gravity applied to overlapping dynamic bodies.
        </p>
        {[0, 1, 2].map((index) => (
          <label
            key={`gravity-${index}`}
            className="mesh-field"
            title={`Override gravity along ${'XYZ'[index]} (m/s²).`}
          >
            <span className="mesh-field__label">{`gravity[${index}]`}</span>
            <input
              className="mesh-field__input"
              type="number"
              step={0.1}
              disabled={disabled}
              value={value.spaceOverride?.gravity?.[index as 0 | 1 | 2] ?? ''}
              onChange={(event) => {
                const raw = event.target.value
                const current = value.spaceOverride?.gravity ?? [0, 0, 0]
                const next = [...current] as [number, number, number]
                next[index as 0 | 1 | 2] = raw === '' ? 0 : Number(raw)
                patch({
                  spaceOverride: {
                    ...value.spaceOverride,
                    gravity: next,
                  },
                })
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
})
