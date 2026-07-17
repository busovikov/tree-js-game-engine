import { memo } from 'react'
import { PhysicsJointSchema, PhysicsJointTypeSchema, type PhysicsJoint } from '@haku/schema'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

export function normalizePhysicsJoint(data: unknown): PhysicsJoint {
  return PhysicsJointSchema.parse(data)
}

export const PhysicsJointFields = memo(function PhysicsJointFields({
  value,
  onChange,
  disabled,
}: {
  value: PhysicsJoint
  onChange?: (next: PhysicsJoint) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<PhysicsJoint>) => onChange?.({ ...value, ...partial } as PhysicsJoint)

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <label className="mesh-field mesh-field--checkbox" title="Disable the joint without removing it.">
          <input
            type="checkbox"
            aria-label="Physics joint enabled"
            checked={value.enabled !== false}
            disabled={disabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          <span className="mesh-field__label">Enabled</span>
        </label>

        <label className="mesh-field" title="Constraint kind: fixed, revolute (hinge), spherical (ball), or prismatic (slider).">
          <span className="mesh-field__label">Type</span>
          <select
            className="mesh-field__input"
            value={value.type}
            disabled={disabled}
            onChange={(event) => patch({ type: PhysicsJointTypeSchema.parse(event.target.value) })}
          >
            {PhysicsJointTypeSchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="mesh-field" title="Entity id (uuid) of the first connected rigid body.">
          <span className="mesh-field__label">Body A id</span>
          <input
            className="mesh-field__input"
            value={value.bodyA}
            disabled={disabled}
            onChange={(event) => patch({ bodyA: event.target.value })}
          />
        </label>

        <label className="mesh-field" title="Entity id (uuid) of the second connected rigid body.">
          <span className="mesh-field__label">Body B id</span>
          <input
            className="mesh-field__input"
            value={value.bodyB}
            disabled={disabled}
            onChange={(event) => patch({ bodyB: event.target.value })}
          />
        </label>
      </div>

      <div className="mesh-renderer-fields__section">
        <div
          style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}
          title="Joint attachment point in body A local space."
        >
          anchorA
        </div>
        {value.anchorA.map((component, index) => (
          <NumberField
            key={`anchorA-${index}`}
            label={`anchorA[${index}]`}
            value={component}
            disabled={disabled}
            hint={`Anchor on body A — local ${'XYZ'[index]} offset.`}
            onChange={(num) => {
              const next = [...value.anchorA] as [number, number, number]
              next[index as 0 | 1 | 2] = num
              patch({ anchorA: next })
            }}
          />
        ))}
      </div>

      <div className="mesh-renderer-fields__section">
        <div
          style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}
          title="Joint attachment point in body B local space."
        >
          anchorB
        </div>
        {value.anchorB.map((component, index) => (
          <NumberField
            key={`anchorB-${index}`}
            label={`anchorB[${index}]`}
            value={component}
            disabled={disabled}
            hint={`Anchor on body B — local ${'XYZ'[index]} offset.`}
            onChange={(num) => {
              const next = [...value.anchorB] as [number, number, number]
              next[index as 0 | 1 | 2] = num
              patch({ anchorB: next })
            }}
          />
        ))}
      </div>

      {(value.type === 'revolute' || value.type === 'prismatic') && (
        <div className="mesh-renderer-fields__section">
          <div
            style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}
            title="Hinge / slide axis direction in local space."
          >
            axis
          </div>
          {value.axis.map((component, index) => (
            <NumberField
              key={`axis-${index}`}
              label={`axis[${index}]`}
              value={component}
              disabled={disabled}
              hint={`Joint axis ${'XYZ'[index]} component.`}
              onChange={(num) => {
                const next = [...value.axis] as [number, number, number]
                next[index as 0 | 1 | 2] = num
                patch({ axis: next })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
})
