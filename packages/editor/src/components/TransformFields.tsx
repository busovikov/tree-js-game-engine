import { memo } from 'react'
import * as THREE from 'three'
import type { Transform } from '@haku/schema'
import './transform-fields.css'

type Vec3 = [number, number, number]
type Quat = [number, number, number, number]

function quatToEulerDegrees(q: Quat): Vec3 {
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

function eulerDegreesToQuat(eulerDeg: Vec3): Quat {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(eulerDeg[0]),
    THREE.MathUtils.degToRad(eulerDeg[1]),
    THREE.MathUtils.degToRad(eulerDeg[2]),
    'XYZ',
  )
  const q = new THREE.Quaternion().setFromEuler(euler)
  return [q.x, q.y, q.z, q.w]
}

function Vec3Row({
  label,
  value,
  onChange,
  disabled,
  step = 0.1,
}: {
  label: string
  value: Vec3
  onChange: (next: Vec3) => void
  disabled?: boolean
  step?: number
}) {
  const axes = ['X', 'Y', 'Z'] as const

  return (
    <div className="haku-transform-row">
      <span className="haku-transform-row-label">{label}</span>
      <div className="haku-transform-axes">
        {axes.map((axis, i) => (
          <label key={axis} className="haku-transform-axis">
            <span className="haku-transform-axis-label">{axis}</span>
            <input
              className="haku-transform-input"
              type="number"
              step={step}
              disabled={disabled}
              value={Number.isFinite(value[i]) ? value[i] : 0}
              onChange={(e) => {
                const next: Vec3 = [...value] as Vec3
                next[i] = Number(e.target.value)
                onChange(next)
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

export const TransformFields = memo(function TransformFields({
  value,
  onChange,
  disabled,
}: {
  value: Transform
  onChange: (next: Transform) => void
  disabled?: boolean
}) {
  const rotationEuler = quatToEulerDegrees(value.rotation as Quat)

  const patch = (partial: Partial<Transform>) => onChange({ ...value, ...partial })

  return (
    <div className="haku-transform-fields">
      <Vec3Row
        label="Position"
        value={value.position as Vec3}
        disabled={disabled}
        step={0.01}
        onChange={(position) => patch({ position })}
      />

      <Vec3Row
        label="Rotation"
        value={rotationEuler}
        disabled={disabled}
        step={1}
        onChange={(euler) => patch({ rotation: eulerDegreesToQuat(euler) })}
      />

      <Vec3Row
        label="Scale"
        value={value.scale as Vec3}
        disabled={disabled}
        step={0.01}
        onChange={(scale) => patch({ scale })}
      />

      <div className="haku-transform-actions">
        <button
          type="button"
          className="haku-transform-reset"
          disabled={disabled}
          onClick={() =>
            patch({
              position: [0, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
            })
          }
        >
          Reset
        </button>
      </div>
    </div>
  )
})
