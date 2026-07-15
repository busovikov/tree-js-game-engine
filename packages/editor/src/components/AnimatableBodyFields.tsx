import { memo } from 'react'
import { AnimatableBodySchema, type AnimatableBody } from '@haku/schema'
import './mesh-renderer-fields.css'

export function normalizeAnimatableBody(data: unknown): AnimatableBody {
  return AnimatableBodySchema.parse(data)
}

export const AnimatableBodyFields = memo(function AnimatableBodyFields({
  value,
  onChange,
  disabled,
}: {
  value: AnimatableBody
  onChange?: (next: AnimatableBody) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<AnimatableBody>) =>
    onChange?.({ ...value, ...partial } as AnimatableBody)

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <label className="mesh-field mesh-field--checkbox" title="Disable animatable body without removing it.">
          <input
            type="checkbox"
            aria-label="Animatable body enabled"
            checked={value.enabled !== false}
            disabled={disabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          <span className="mesh-field__label">Enabled</span>
        </label>

        <label className="mesh-field" title="How transform updates align with the physics step.">
          <span className="mesh-field__label">Sync mode</span>
          <select
            className="mesh-field__input"
            value={value.syncMode}
            disabled={disabled}
            onChange={(event) =>
              patch({ syncMode: event.target.value as AnimatableBody['syncMode'] })
            }
          >
            <option value="physics">physics</option>
            <option value="discrete">discrete</option>
          </select>
        </label>
      </div>
    </div>
  )
})
