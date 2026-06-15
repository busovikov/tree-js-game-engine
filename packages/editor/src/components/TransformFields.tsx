import { memo } from 'react'
import * as THREE from 'three'
import type { Transform } from '@haku/schema'
import type { MixedVec3 } from '../inspector/multi-edit.js'
import './transform-fields.css'

type Vec3 = [number, number, number]
type Quat = [number, number, number, number]

const MIXED_PLACEHOLDER = '—'

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
  mixed,
  onChange,
  onAxisChange,
  disabled,
  step = 0.1,
}: {
  label: string
  value: Vec3
  mixed?: MixedVec3
  onChange?: (next: Vec3) => void
  onAxisChange?: (axis: 0 | 1 | 2, value: number) => void
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
              className={`haku-transform-input${mixed?.[i] === null ? ' haku-transform-input--mixed' : ''}`}
              type="number"
              step={step}
              disabled={disabled}
              value={mixed?.[i] === null ? '' : Number.isFinite(value[i]) ? value[i] : 0}
              placeholder={mixed?.[i] === null ? MIXED_PLACEHOLDER : undefined}
              onChange={(e) => {
                const nextValue = Number(e.target.value)
                if (onAxisChange) {
                  onAxisChange(i as 0 | 1 | 2, nextValue)
                  return
                }
                if (!onChange) return
                const next: Vec3 = [...value] as Vec3
                next[i] = nextValue
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
  mixedPosition,
  mixedRotation,
  mixedScale,
  onChange,
  onPositionAxisChange,
  onRotationAxisChange,
  onScaleAxisChange,
  disabled,
}: {
  value: Transform
  mixedPosition?: MixedVec3
  mixedRotation?: MixedVec3
  mixedScale?: MixedVec3
  onChange?: (next: Transform) => void
  onPositionAxisChange?: (axis: 0 | 1 | 2, value: number) => void
  onRotationAxisChange?: (axis: 0 | 1 | 2, value: number) => void
  onScaleAxisChange?: (axis: 0 | 1 | 2, value: number) => void
  disabled?: boolean
}) {
  const rotationEuler = quatToEulerDegrees(value.rotation as Quat)

  const patch = (partial: Partial<Transform>) => {
    if (!onChange) return
    onChange({ ...value, ...partial })
  }

  return (
    <div className="haku-transform-fields">
      <Vec3Row
        label="Position"
        value={value.position as Vec3}
        mixed={mixedPosition}
        disabled={disabled}
        step={0.01}
        onChange={onChange ? (position) => patch({ position }) : undefined}
        onAxisChange={onPositionAxisChange}
      />

      <Vec3Row
        label="Rotation"
        value={rotationEuler}
        mixed={mixedRotation}
        disabled={disabled}
        step={1}
        onChange={
          onChange
            ? (euler) => patch({ rotation: eulerDegreesToQuat(euler) })
            : undefined
        }
        onAxisChange={onRotationAxisChange}
      />

      <Vec3Row
        label="Scale"
        value={value.scale as Vec3}
        mixed={mixedScale}
        disabled={disabled}
        step={0.01}
        onChange={onChange ? (scale) => patch({ scale }) : undefined}
        onAxisChange={onScaleAxisChange}
      />
    </div>
  )
})
