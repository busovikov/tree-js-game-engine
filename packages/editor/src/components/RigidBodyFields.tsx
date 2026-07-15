import { memo } from 'react'
import { RigidBodySchema, type RigidBody } from '@haku/schema'
import { EDITOR_PHYSICS_CAPABILITIES } from '../physics/editor-physics-capabilities.js'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

export function normalizeRigidBody(data: unknown): RigidBody {
  return RigidBodySchema.parse(data)
}

const caps = EDITOR_PHYSICS_CAPABILITIES.rigidBody

export const RigidBodyFields = memo(function RigidBodyFields({
  value,
  onChange,
  disabled,
}: {
  value: RigidBody
  onChange?: (next: RigidBody) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<RigidBody>) => onChange?.({ ...value, ...partial } as RigidBody)

  const patchLock = (
    key: 'lockPosition' | 'lockRotation',
    axis: 0 | 1 | 2,
    locked: boolean,
  ) => {
    const next = [...value[key]] as [boolean, boolean, boolean]
    next[axis] = locked
    patch({ [key]: next } as Partial<RigidBody>)
  }

  const patchCenterOfMass = (axis: 0 | 1 | 2, num: number) => {
    const base = value.centerOfMass ?? [0, 0, 0]
    const next = [...base] as [number, number, number]
    next[axis] = num
    patch({ centerOfMass: next })
  }

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <label className="mesh-field mesh-field--checkbox" title="Disable rigid body without removing it.">
          <input
            type="checkbox"
            aria-label="Rigid body enabled"
            checked={value.enabled !== false}
            disabled={disabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          <span className="mesh-field__label">Enabled</span>
        </label>

        <label className="mesh-field" title="Physics body motion type.">
          <span className="mesh-field__label">Type</span>
          <select
            className="mesh-field__input"
            value={value.type}
            disabled={disabled}
            onChange={(event) =>
              patch({ type: event.target.value as RigidBody['type'] })
            }
          >
            {caps.types.has('static') && <option value="static">static</option>}
            {caps.types.has('dynamic') && <option value="dynamic">dynamic</option>}
            {caps.types.has('kinematic') && <option value="kinematic">kinematic</option>}
          </select>
        </label>

        {value.type === 'kinematic' && caps.kinematicVelocityBased && (
          <label className="mesh-field" title="Position-based or velocity-based kinematic body.">
            <span className="mesh-field__label">Kinematic mode</span>
            <select
              className="mesh-field__input"
              value={value.kinematicMode}
              disabled={disabled}
              onChange={(event) =>
                patch({ kinematicMode: event.target.value as RigidBody['kinematicMode'] })
              }
            >
              <option value="position">position</option>
              <option value="velocity">velocity</option>
            </select>
          </label>
        )}

        <label className="mesh-field mesh-field--checkbox" title="Render interpolation between fixed physics steps.">
          <input
            type="checkbox"
            aria-label="Rigid body interpolation"
            checked={value.interpolation === 'interpolate'}
            disabled={disabled}
            onChange={(event) =>
              patch({ interpolation: event.target.checked ? 'interpolate' : 'none' })
            }
          />
          <span className="mesh-field__label">Interpolate</span>
        </label>

        <label className="mesh-field mesh-field--checkbox" title="Emit collision events for this body.">
          <input
            type="checkbox"
            aria-label="Rigid body contact monitor"
            checked={value.contactMonitor}
            disabled={disabled}
            onChange={(event) =>
              patch({
                contactMonitor: event.target.checked,
                maxReportedContacts:
                  event.target.checked && value.maxReportedContacts === 0
                    ? 4
                    : value.maxReportedContacts,
              })
            }
          />
          <span className="mesh-field__label">Contact monitor</span>
        </label>

        {value.contactMonitor && (
          <label className="mesh-field" title="Max contact points reported per collision enter (0 = none).">
            <span className="mesh-field__label">Max contacts</span>
            <input
              className="mesh-field__input"
              type="number"
              min={0}
              max={16}
              step={1}
              value={value.maxReportedContacts}
              disabled={disabled}
              onChange={(event) =>
                patch({ maxReportedContacts: Math.max(0, Number(event.target.value) || 0) })
              }
            />
          </label>
        )}

        {value.type === 'dynamic' && caps.ccd && (
          <label className="mesh-field mesh-field--checkbox" title="Continuous collision detection for fast movers.">
            <input
              type="checkbox"
              aria-label="Rigid body CCD"
              checked={value.ccdEnabled}
              disabled={disabled}
              onChange={(event) => patch({ ccdEnabled: event.target.checked })}
            />
            <span className="mesh-field__label">CCD</span>
          </label>
        )}
      </div>

      {(value.type === 'dynamic' || value.type === 'kinematic') && (
        <div className="mesh-renderer-fields__section">
          {caps.massAutoFromColliders && (
            <label className="mesh-field" title="Explicit target mass or auto-compute from colliders.">
              <span className="mesh-field__label">Mass mode</span>
              <select
                className="mesh-field__input"
                value={value.massMode}
                disabled={disabled}
                onChange={(event) =>
                  patch({ massMode: event.target.value as RigidBody['massMode'] })
                }
              >
                <option value="explicit">explicit</option>
                <option value="autoFromColliders">auto from colliders</option>
              </select>
            </label>
          )}

          {value.massMode === 'explicit' && value.type === 'dynamic' && (
            <NumberField
              label="mass"
              value={value.mass}
              min={0.001}
              step={0.1}
              disabled={disabled}
              hint="Target mass in kilograms."
              onChange={(mass) => patch({ mass: Math.max(0.001, mass) })}
            />
          )}

          {value.type === 'dynamic' && (
            <NumberField
              label="gravityScale"
              value={value.gravityScale}
              step={0.1}
              disabled={disabled}
              hint="0 disables gravity on this body."
              onChange={(gravityScale) => patch({ gravityScale })}
            />
          )}
        </div>
      )}

      {caps.axisLock && (value.type === 'dynamic' || value.type === 'kinematic') && (
        <div className="mesh-renderer-fields__section">
          <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>Lock position</div>
          {(['X', 'Y', 'Z'] as const).map((label, index) => (
            <label key={`lock-pos-${label}`} className="mesh-field mesh-field--checkbox">
              <input
                type="checkbox"
                aria-label={`Lock position ${label}`}
                checked={value.lockPosition[index] === true}
                disabled={disabled}
                onChange={(event) => patchLock('lockPosition', index as 0 | 1 | 2, event.target.checked)}
              />
              <span className="mesh-field__label">{label}</span>
            </label>
          ))}
          <div style={{ color: '#aaa', fontSize: 12, margin: '8px 0 4px' }}>Lock rotation</div>
          {(['X', 'Y', 'Z'] as const).map((label, index) => (
            <label key={`lock-rot-${label}`} className="mesh-field mesh-field--checkbox">
              <input
                type="checkbox"
                aria-label={`Lock rotation ${label}`}
                checked={value.lockRotation[index] === true}
                disabled={disabled}
                onChange={(event) => patchLock('lockRotation', index as 0 | 1 | 2, event.target.checked)}
              />
              <span className="mesh-field__label">{label}</span>
            </label>
          ))}
        </div>
      )}

      {caps.centerOfMass && value.type === 'dynamic' && (
        <div className="mesh-renderer-fields__section">
          <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>Center of mass (local)</div>
          {[0, 1, 2].map((index) => (
            <NumberField
              key={`com-${index}`}
              label={`com[${index}]`}
              value={value.centerOfMass?.[index] ?? 0}
              step={0.05}
              disabled={disabled}
              hint="Local center-of-mass offset."
              onChange={(num) => patchCenterOfMass(index as 0 | 1 | 2, num)}
            />
          ))}
        </div>
      )}
    </div>
  )
})
