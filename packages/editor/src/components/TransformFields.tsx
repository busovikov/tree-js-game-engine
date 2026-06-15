import { memo, useCallback } from 'react'
import * as THREE from 'three'
import type { Transform } from '@haku/schema'
import type { MixedVec3 } from '../inspector/multi-edit.js'
import { useEditorStore } from '../store/editor-store.js'
import { DraggableNumberLabel } from './DraggableNumberLabel.js'
import './transform-fields.css'

type Vec3 = [number, number, number]
type Quat = [number, number, number, number]

const MIXED_PLACEHOLDER = '—'

const ROW_HINTS: Record<string, string> = {
  Position: 'World position of the entity.',
  Rotation: 'Rotation in degrees (Euler XYZ).',
  Scale: 'Local scale per axis.',
}

const AXIS_HINTS: Record<string, Record<string, string>> = {
  Position: { X: 'Position on the X axis.', Y: 'Position on the Y axis.', Z: 'Position on the Z axis.' },
  Rotation: { X: 'Pitch (X rotation) in degrees.', Y: 'Yaw (Y rotation) in degrees.', Z: 'Roll (Z rotation) in degrees.' },
  Scale: { X: 'Scale along X.', Y: 'Scale along Y.', Z: 'Scale along Z.' },
}

const AXIS_CLASS: Record<string, string> = {
  X: 'haku-transform-axis--x',
  Y: 'haku-transform-axis--y',
  Z: 'haku-transform-axis--z',
}

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

export function applyUniformScaleAxis(value: Vec3, axis: 0 | 1 | 2, nextValue: number): Vec3 {
  const base = value[axis]
  if (base === 0) {
    const next: Vec3 = [...value] as Vec3
    next[axis] = nextValue
    return next
  }
  const ratio = nextValue / base
  return [value[0] * ratio, value[1] * ratio, value[2] * ratio]
}

function Vec3Row({
  label,
  value,
  mixed,
  onChange,
  onAxisChange,
  disabled,
  step = 0.1,
  scrubMultiplier = 1,
}: {
  label: string
  value: Vec3
  mixed?: MixedVec3
  onChange?: (next: Vec3) => void
  onAxisChange?: (axis: 0 | 1 | 2, value: number) => void
  disabled?: boolean
  step?: number
  scrubMultiplier?: number
}) {
  const axes = ['X', 'Y', 'Z'] as const
  const axisHints = AXIS_HINTS[label] ?? {}

  const setAxis = (index: 0 | 1 | 2, nextValue: number) => {
    if (onAxisChange) {
      onAxisChange(index, nextValue)
      return
    }
    if (!onChange) return
    const next: Vec3 = [...value] as Vec3
    next[index] = nextValue
    onChange(next)
  }

  return (
    <div className="haku-transform-row">
      <span className="haku-transform-row-label" title={ROW_HINTS[label]}>
        {label}
      </span>
      <div className="haku-transform-axes haku-transform-axes--aligned">
        <span className="haku-transform-leading-slot" aria-hidden="true" />
        {axes.map((axis, i) => {
          const axisIndex = i as 0 | 1 | 2
          const isMixed = mixed?.[i] === null
          const axisDisabled = disabled || isMixed

          return (
            <label key={axis} className={`haku-transform-axis ${AXIS_CLASS[axis]}`}>
              <DraggableNumberLabel
                className="haku-transform-axis-label"
                value={Number.isFinite(value[i]) ? value[i]! : 0}
                step={step}
                scrubMultiplier={scrubMultiplier}
                disabled={axisDisabled}
                hint={axisHints[axis]}
                onChange={(nextValue) => setAxis(axisIndex, nextValue)}
              >
                {axis}
              </DraggableNumberLabel>
              <input
                className={`haku-transform-input${isMixed ? ' haku-transform-input--mixed' : ''}`}
                type="number"
                step={step}
                disabled={axisDisabled}
                value={isMixed ? '' : Number.isFinite(value[i]) ? value[i] : 0}
                placeholder={isMixed ? MIXED_PLACEHOLDER : undefined}
                onChange={(e) => setAxis(axisIndex, Number(e.target.value))}
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}

function ScaleRow({
  value,
  mixed,
  onChange,
  onAxisChange,
  onUniformAxisChange,
  disabled,
  step = 0.01,
  scrubMultiplier = 20,
}: {
  value: Vec3
  mixed?: MixedVec3
  onChange?: (next: Vec3) => void
  onAxisChange?: (axis: 0 | 1 | 2, value: number) => void
  onUniformAxisChange?: (axis: 0 | 1 | 2, value: number) => void
  disabled?: boolean
  step?: number
  scrubMultiplier?: number
}) {
  const uniformScaleLocked = useEditorStore((s) => s.uniformScaleLocked)
  const setUniformScaleLocked = useEditorStore((s) => s.setUniformScaleLocked)
  const axes = ['X', 'Y', 'Z'] as const
  const axisHints = AXIS_HINTS.Scale

  const setAxis = useCallback(
    (index: 0 | 1 | 2, nextValue: number) => {
      if (uniformScaleLocked) {
        if (onUniformAxisChange) {
          onUniformAxisChange(index, nextValue)
          return
        }
        if (onChange) {
          onChange(applyUniformScaleAxis(value, index, nextValue))
          return
        }
      }

      if (onAxisChange) {
        onAxisChange(index, nextValue)
        return
      }
      if (!onChange) return
      const next: Vec3 = [...value] as Vec3
      next[index] = nextValue
      onChange(next)
    },
    [onAxisChange, onChange, onUniformAxisChange, uniformScaleLocked, value],
  )

  return (
    <div className="haku-transform-row">
      <span className="haku-transform-row-label" title={ROW_HINTS.Scale}>
        Scale
      </span>
      <div className="haku-transform-axes haku-transform-axes--aligned">
        <div className="haku-transform-leading-slot">
          <button
            type="button"
            className={`haku-transform-uniform-toggle${uniformScaleLocked ? ' haku-transform-uniform-toggle--active' : ''}`}
            title={
              uniformScaleLocked
                ? 'Uniform scale on — changes keep proportions across X, Y, and Z.'
                : 'Uniform scale off — enable to scale all axes proportionally.'
            }
            aria-pressed={uniformScaleLocked}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation()
              setUniformScaleLocked(!uniformScaleLocked)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M8 12a4 4 0 0 1 4-4h6M16 12a4 4 0 0 1-4 4H6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M9 9l-2-2M9 15l-2 2M15 9l2-2M15 15l2 2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {axes.map((axis, i) => {
          const axisIndex = i as 0 | 1 | 2
          const isMixed = mixed?.[i] === null
          const axisDisabled = disabled || isMixed

          return (
            <label key={axis} className={`haku-transform-axis ${AXIS_CLASS[axis]}`}>
              <DraggableNumberLabel
                className="haku-transform-axis-label"
                value={Number.isFinite(value[i]) ? value[i]! : 0}
                step={step}
                scrubMultiplier={scrubMultiplier}
                disabled={axisDisabled}
                hint={axisHints[axis]}
                onChange={(nextValue) => setAxis(axisIndex, nextValue)}
              >
                {axis}
              </DraggableNumberLabel>
              <input
                className={`haku-transform-input${isMixed ? ' haku-transform-input--mixed' : ''}`}
                type="number"
                step={step}
                disabled={axisDisabled}
                value={isMixed ? '' : Number.isFinite(value[i]) ? value[i] : 0}
                placeholder={isMixed ? MIXED_PLACEHOLDER : undefined}
                onChange={(e) => setAxis(axisIndex, Number(e.target.value))}
              />
            </label>
          )
        })}
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
  onUniformScaleAxisChange,
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
  onUniformScaleAxisChange?: (axis: 0 | 1 | 2, value: number) => void
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
        scrubMultiplier={20}
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

      <ScaleRow
        value={value.scale as Vec3}
        mixed={mixedScale}
        disabled={disabled}
        step={0.01}
        scrubMultiplier={20}
        onChange={onChange ? (scale) => patch({ scale }) : undefined}
        onAxisChange={onScaleAxisChange}
        onUniformAxisChange={onUniformScaleAxisChange}
      />
    </div>
  )
})
