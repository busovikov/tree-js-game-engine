import { memo } from 'react'
import {
  PhysicsControllerSchema,
  PhysicsControllerTypeSchema,
  type PhysicsController,
  type PhysicsControllerType,
} from '@haku/schema'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

export function normalizePhysicsController(data: unknown): PhysicsController {
  return PhysicsControllerSchema.parse(data)
}

/** @deprecated */
export const normalizeVehicle = normalizePhysicsController

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

const CONTROLLER_TYPE_LABELS: Record<PhysicsControllerType, string> = {
  'custom-raycast': 'Custom raycast vehicle',
  'dynamic-raycast': 'Dynamic raycast (Rapier)',
  'arcade-vehicle': 'Arcade vehicle',
  'revolute-joint-vehicle': 'Revolute joint vehicle',
  'kinematic-character': 'Kinematic character',
  'character-body': 'Character body',
  'pointer-controls': 'Pointer controls',
}

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="mesh-renderer-fields__heading" title={children}>
      {children}
    </div>
  )
}

function Vec3Fields({
  label,
  values,
  min,
  step,
  disabled,
  onAxisChange,
}: {
  label: string
  values: [number, number, number]
  min?: number
  step?: number
  disabled?: boolean
  onAxisChange: (axis: 0 | 1 | 2, value: number) => void
}) {
  return (
    <>
      <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }} title={label}>
        {label}
      </div>
      {values.map((component, index) => (
        <NumberField
          key={`${label}-${index}`}
          label={`${label}[${index}]`}
          value={component}
          min={min}
          step={step ?? 0.01}
          disabled={disabled}
          hint={`${label} component ${index}.`}
          onChange={(num) => onAxisChange(index as 0 | 1 | 2, num)}
        />
      ))}
    </>
  )
}

export const PhysicsControllerFields = memo(function PhysicsControllerFields({
  value,
  onChange,
  disabled,
}: {
  value: PhysicsController
  onChange?: (next: PhysicsController) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<PhysicsController>) =>
    onChange?.(PhysicsControllerSchema.parse({ ...value, ...partial }))

  const setType = (type: PhysicsControllerType) => {
    onChange?.(PhysicsControllerSchema.parse({ type }))
  }

  const typeSelector = (
    <>
      <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>Controller type</div>
      <select
        className="mesh-renderer-fields__select"
        value={value.type}
        disabled={disabled}
        onChange={(e) => setType(e.target.value as PhysicsControllerType)}
      >
        {PhysicsControllerTypeSchema.options.map((t) => (
          <option key={t} value={t}>
            {CONTROLLER_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <NumberField
        label="Enabled"
        value={value.enabled ? 1 : 0}
        min={0}
        max={1}
        step={1}
        disabled={disabled}
        onChange={(n) => patch({ enabled: n >= 0.5 })}
      />
      <label className="mesh-field mesh-field--checkbox" title="Whether play mode drives the scene camera to chase/follow this controller.">
        <input
          type="checkbox"
          checked={value.followCamera}
          disabled={disabled}
          onChange={(e) => patch({ followCamera: e.target.checked })}
        />
        <span className="mesh-field__label">Follow Camera</span>
      </label>
    </>
  )

  if (value.type === 'dynamic-raycast') {
    return (
      <div className="mesh-renderer-fields">
        {typeSelector}
        <SectionHeading>Dynamic raycast (Rapier)</SectionHeading>
        <NumberField label="accelerateForce" value={value.accelerateForce} min={0.001} step={0.1} disabled={disabled} onChange={(n) => patch({ accelerateForce: Math.max(0.001, n) })} />
        <NumberField label="brakeForce" value={value.brakeForce} min={0} step={0.01} disabled={disabled} onChange={(n) => patch({ brakeForce: Math.max(0, n) })} />
        <NumberField label="steerAngle" value={value.steerAngle} min={0.001} step={0.01} disabled={disabled} onChange={(n) => patch({ steerAngle: Math.max(0.001, n) })} />
        <NumberField label="chassis.mass" value={value.chassis.mass} min={0.001} step={1} disabled={disabled} onChange={(n) => patch({ chassis: { ...value.chassis, mass: Math.max(0.001, n) } })} />
        <NumberField label="wheels.radius" value={value.wheels.radius} min={0.001} step={0.01} disabled={disabled} onChange={(n) => patch({ wheels: { ...value.wheels, radius: Math.max(0.001, n) } })} />
      </div>
    )
  }

  if (value.type === 'arcade-vehicle') {
    return (
      <div className="mesh-renderer-fields">
        {typeSelector}
        <SectionHeading>Arcade vehicle</SectionHeading>
        <NumberField label="maxForwardSpeed" value={value.maxForwardSpeed} min={0.001} step={0.1} disabled={disabled} onChange={(n) => patch({ maxForwardSpeed: Math.max(0.001, n) })} />
        <NumberField label="maxReverseSpeed" value={value.maxReverseSpeed} step={0.1} disabled={disabled} onChange={(n) => patch({ maxReverseSpeed: n })} />
        <NumberField label="jumpImpulse" value={value.jumpImpulse} min={0.001} step={0.5} disabled={disabled} onChange={(n) => patch({ jumpImpulse: Math.max(0.001, n) })} />
        <NumberField label="driftSteerRate" value={value.driftSteerRate} min={0.001} step={0.001} disabled={disabled} onChange={(n) => patch({ driftSteerRate: Math.max(0.001, n) })} />
        <NumberField label="speedLerp" value={value.speedLerp} min={0} max={1} step={0.01} disabled={disabled} onChange={(n) => patch({ speedLerp: clamp01(n) })} />
        <NumberField label="damping" value={value.damping} min={0.001} step={0.1} disabled={disabled} onChange={(n) => patch({ damping: Math.max(0.001, n) })} />
      </div>
    )
  }

  if (value.type === 'kinematic-character') {
    return (
      <div className="mesh-renderer-fields">
        {typeSelector}
        <SectionHeading>Kinematic character</SectionHeading>
        <NumberField label="capsuleRadius" value={value.capsuleRadius} min={0.001} step={0.01} disabled={disabled} onChange={(n) => patch({ capsuleRadius: Math.max(0.001, n) })} />
        <NumberField label="capsuleHalfHeight" value={value.capsuleHalfHeight} min={0} step={0.01} disabled={disabled} onChange={(n) => patch({ capsuleHalfHeight: Math.max(0, n) })} />
        <NumberField label="moveSpeed" value={value.moveSpeed} min={0.001} step={0.1} disabled={disabled} onChange={(n) => patch({ moveSpeed: Math.max(0.001, n) })} />
        <NumberField label="sprintMultiplier" value={value.sprintMultiplier} min={0.001} step={0.1} disabled={disabled} onChange={(n) => patch({ sprintMultiplier: Math.max(0.001, n) })} />
        <NumberField label="maxJumpHeight" value={value.maxJumpHeight} min={0.001} step={0.1} disabled={disabled} onChange={(n) => patch({ maxJumpHeight: Math.max(0.001, n) })} />
        <NumberField label="snapToGroundDistance" value={value.snapToGroundDistance} min={0} step={0.01} disabled={disabled} onChange={(n) => patch({ snapToGroundDistance: Math.max(0, n) })} />
      </div>
    )
  }

  if (value.type === 'character-body') {
    return (
      <div className="mesh-renderer-fields">
        {typeSelector}
        <SectionHeading>Character body (move_and_slide)</SectionHeading>
        <NumberField label="capsuleRadius" value={value.capsuleRadius} min={0.001} step={0.01} disabled={disabled} onChange={(n) => patch({ capsuleRadius: Math.max(0.001, n) })} />
        <NumberField label="capsuleHalfHeight" value={value.capsuleHalfHeight} min={0} step={0.01} disabled={disabled} onChange={(n) => patch({ capsuleHalfHeight: Math.max(0, n) })} />
        <NumberField label="moveSpeed" value={value.moveSpeed} min={0.001} step={0.1} disabled={disabled} onChange={(n) => patch({ moveSpeed: Math.max(0.001, n) })} />
        <NumberField label="floorMaxAngle" value={value.floorMaxAngle} min={0} max={90} step={1} disabled={disabled} onChange={(n) => patch({ floorMaxAngle: Math.max(0, Math.min(90, n)) })} />
        <NumberField label="floorSnapLength" value={value.floorSnapLength} min={0} step={0.01} disabled={disabled} onChange={(n) => patch({ floorSnapLength: Math.max(0, n) })} />
        <NumberField label="stepHeight" value={value.stepHeight} min={0} step={0.05} disabled={disabled} onChange={(n) => patch({ stepHeight: Math.max(0, n) })} />
        <NumberField label="maxJumpHeight" value={value.maxJumpHeight} min={0.001} step={0.1} disabled={disabled} onChange={(n) => patch({ maxJumpHeight: Math.max(0.001, n) })} />
      </div>
    )
  }

  if (value.type === 'pointer-controls') {
    return (
      <div className="mesh-renderer-fields">
        {typeSelector}
        <SectionHeading>Pointer controls</SectionHeading>
        <label className="mesh-field mesh-field--checkbox">
          <input type="checkbox" checked={value.draggable} disabled={disabled} onChange={(e) => patch({ draggable: e.target.checked })} />
          <span className="mesh-field__label">draggable</span>
        </label>
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>constraintType</div>
        <select className="mesh-renderer-fields__select" value={value.constraintType} disabled={disabled} onChange={(e) => patch({ constraintType: e.target.value as typeof value.constraintType })}>
          <option value="spherical">spherical</option>
          <option value="spring">spring</option>
          <option value="rope">rope</option>
        </select>
        <NumberField label="springStiffness" value={value.springStiffness} min={0} step={1} disabled={disabled} onChange={(n) => patch({ springStiffness: Math.max(0, n) })} />
        <NumberField label="springDamping" value={value.springDamping} min={0} step={0.1} disabled={disabled} onChange={(n) => patch({ springDamping: Math.max(0, n) })} />
        <NumberField label="ropeLength" value={value.ropeLength} min={0.001} step={0.05} disabled={disabled} onChange={(n) => patch({ ropeLength: Math.max(0.001, n) })} />
      </div>
    )
  }

  if (value.type === 'revolute-joint-vehicle') {
    return (
      <div className="mesh-renderer-fields">
        {typeSelector}
        <SectionHeading>Revolute joint vehicle</SectionHeading>
        <NumberField label="wheelRadius" value={value.wheelRadius} min={0.001} step={0.01} disabled={disabled} onChange={(n) => patch({ wheelRadius: Math.max(0.001, n) })} />
        <NumberField label="wheelHalfHeight" value={value.wheelHalfHeight} min={0.001} step={0.01} disabled={disabled} onChange={(n) => patch({ wheelHalfHeight: Math.max(0.001, n) })} />
        <NumberField label="wheelMass" value={value.wheelMass} min={0.001} max={value.chassis.mass} step={0.05} disabled={disabled} onChange={(n) => patch({ wheelMass: Math.min(value.chassis.mass, Math.max(0.001, n)) })} />
        <NumberField label="hubMass" value={value.hubMass} min={0.001} max={value.chassis.mass} step={0.05} disabled={disabled} onChange={(n) => patch({ hubMass: Math.min(value.chassis.mass, Math.max(0.001, n)) })} />
        <NumberField label="suspensionRestLength" value={value.suspensionRestLength} min={0} max={5} step={0.05} disabled={disabled} onChange={(n) => patch({ suspensionRestLength: Math.min(5, Math.max(0, n)) })} />
        <NumberField label="suspensionStiffness" value={value.suspensionStiffness} min={0.001} step={10} disabled={disabled} onChange={(n) => patch({ suspensionStiffness: Math.max(0.001, n) })} />
        <NumberField label="suspensionDamping" value={value.suspensionDamping} min={0.001} step={5} disabled={disabled} onChange={(n) => patch({ suspensionDamping: Math.max(0.001, n) })} />
        <NumberField label="suspensionTravel" value={value.suspensionTravel} min={0.001} max={5} step={0.05} disabled={disabled} onChange={(n) => patch({ suspensionTravel: Math.min(5, Math.max(0.001, n)) })} />
        <NumberField label="drivenTargetVelocity" value={value.drivenTargetVelocity} min={0.001} max={500} step={10} disabled={disabled} onChange={(n) => patch({ drivenTargetVelocity: Math.min(500, Math.max(0.001, n)) })} />
        <NumberField label="drivenFactor" value={value.drivenFactor} min={0.001} step={10} disabled={disabled} onChange={(n) => patch({ drivenFactor: Math.max(0.001, n) })} />
        <NumberField label="steerAngle" value={value.steerAngle} min={0.001} step={0.05} disabled={disabled} onChange={(n) => patch({ steerAngle: Math.max(0.001, n) })} />
        <NumberField label="steerStiffness" value={value.steerStiffness} min={0.001} step={1} disabled={disabled} onChange={(n) => patch({ steerStiffness: Math.max(0.001, n) })} />
        <NumberField label="steerDamping" value={value.steerDamping} min={0} step={0.5} disabled={disabled} onChange={(n) => patch({ steerDamping: Math.max(0, n) })} />
      </div>
    )
  }

  if (value.type !== 'custom-raycast') {
    return null
  }

  const patchRaycast = (partial: Partial<Extract<PhysicsController, { type: 'custom-raycast' }>>) =>
    patch(partial as Partial<PhysicsController>)

  const patchChassis = (partial: Partial<Extract<PhysicsController, { type: 'custom-raycast' }>['chassis']>) =>
    patchRaycast({ chassis: { ...value.chassis, ...partial } })

  const patchWheels = (partial: Partial<Extract<PhysicsController, { type: 'custom-raycast' }>['wheels']>) =>
    patchRaycast({ wheels: { ...value.wheels, ...partial } })

  const patchSuspension = (partial: Partial<Extract<PhysicsController, { type: 'custom-raycast' }>['suspension']>) =>
    patchRaycast({ suspension: { ...value.suspension, ...partial } })

  const patchEngine = (partial: Partial<Extract<PhysicsController, { type: 'custom-raycast' }>['engine']>) =>
    patchRaycast({ engine: { ...value.engine, ...partial } })

  const patchSteering = (partial: Partial<Extract<PhysicsController, { type: 'custom-raycast' }>['steering']>) =>
    patchRaycast({ steering: { ...value.steering, ...partial } })

  const patchBrakes = (partial: Partial<Extract<PhysicsController, { type: 'custom-raycast' }>['brakes']>) =>
    patchRaycast({ brakes: { ...value.brakes, ...partial } })

  const patchChassisHalfExtents = (axis: 0 | 1 | 2, num: number) => {
    const next = [...value.chassis.halfExtents] as [number, number, number]
    next[axis] = Math.max(0.001, num)
    patchChassis({ halfExtents: next })
  }

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>Controller type</div>
        <select
          className="mesh-renderer-fields__select"
          value={value.type}
          disabled={disabled}
          onChange={(e) => setType(e.target.value as PhysicsControllerType)}
        >
          {PhysicsControllerTypeSchema.options.map((t) => (
            <option key={t} value={t}>
              {CONTROLLER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="mesh-field mesh-field--checkbox" title="Whether play mode drives the scene camera to chase/follow this controller.">
          <input
            type="checkbox"
            checked={value.followCamera}
            disabled={disabled}
            onChange={(e) => patchRaycast({ followCamera: e.target.checked })}
          />
          <span className="mesh-field__label">Follow Camera</span>
        </label>
        <SectionHeading>Chassis</SectionHeading>
        <p className="mesh-renderer-fields__hint" title="Raycast vehicle physics body — no separate Collider component.">
          Implicit physics box (orange wireframe in viewport). Edit halfExtents and lift below.
        </p>
        <NumberField
          label="mass"
          value={value.chassis.mass}
          min={0.001}
          step={1}
          disabled={disabled}
          hint="Chassis mass in kg."
          onChange={(mass) => patchChassis({ mass: Math.max(0.001, mass) })}
        />
        <Vec3Fields
          label="halfExtents"
          values={value.chassis.halfExtents}
          min={0.001}
          step={0.05}
          disabled={disabled}
          onAxisChange={patchChassisHalfExtents}
        />
        <NumberField
          label="lift"
          value={value.chassis.lift}
          min={0}
          step={0.05}
          disabled={disabled}
          hint="Physics box vertical offset above entity origin."
          onChange={(lift) => patchChassis({ lift: Math.max(0, lift) })}
        />
        <NumberField
          label="angularDamping"
          value={value.chassis.angularDamping}
          min={0}
          step={0.01}
          disabled={disabled}
          hint="Angular velocity damping on chassis body."
          onChange={(angularDamping) => patchChassis({ angularDamping: Math.max(0, angularDamping) })}
        />
        <NumberField
          label="inertiaScale"
          value={value.chassis.inertiaScale}
          min={0.001}
          step={0.1}
          disabled={disabled}
          hint="Pitch/roll inertia multiplier."
          onChange={(inertiaScale) => patchChassis({ inertiaScale: Math.max(0.001, inertiaScale) })}
        />
      </div>

      <div className="mesh-renderer-fields__section">
        <SectionHeading>Wheels</SectionHeading>
        <NumberField
          label="radius"
          value={value.wheels.radius}
          min={0.001}
          step={0.01}
          disabled={disabled}
          hint="Raycast wheel radius."
          onChange={(radius) => patchWheels({ radius: Math.max(0.001, radius) })}
        />
        <NumberField
          label="halfWidth"
          value={value.wheels.halfWidth}
          min={0.001}
          step={0.05}
          disabled={disabled}
          hint="Half track width."
          onChange={(halfWidth) => patchWheels({ halfWidth: Math.max(0.001, halfWidth) })}
        />
        <NumberField
          label="height"
          value={value.wheels.height}
          step={0.01}
          disabled={disabled}
          hint="Vertical wheel connection offset."
          onChange={(height) => patchWheels({ height })}
        />
        <NumberField
          label="halfLength"
          value={value.wheels.halfLength}
          min={0.001}
          step={0.05}
          disabled={disabled}
          hint="Half wheelbase."
          onChange={(halfLength) => patchWheels({ halfLength: Math.max(0.001, halfLength) })}
        />
      </div>

      <div className="mesh-renderer-fields__section">
        <SectionHeading>Suspension</SectionHeading>
        <NumberField
          label="stiffness"
          value={value.suspension.stiffness}
          min={0.001}
          step={1}
          disabled={disabled}
          onChange={(stiffness) => patchSuspension({ stiffness: Math.max(0.001, stiffness) })}
        />
        <NumberField
          label="restLength"
          value={value.suspension.restLength}
          min={0.001}
          step={0.01}
          disabled={disabled}
          onChange={(restLength) => patchSuspension({ restLength: Math.max(0.001, restLength) })}
        />
        <NumberField
          label="maxTravel"
          value={value.suspension.maxTravel}
          min={0}
          step={0.01}
          disabled={disabled}
          onChange={(maxTravel) => patchSuspension({ maxTravel: Math.max(0, maxTravel) })}
        />
        <NumberField
          label="frictionSlip"
          value={value.suspension.frictionSlip}
          min={0.001}
          step={0.1}
          disabled={disabled}
          onChange={(frictionSlip) => patchSuspension({ frictionSlip: Math.max(0.001, frictionSlip) })}
        />
        <NumberField
          label="dampingRelaxation"
          value={value.suspension.dampingRelaxation}
          min={0.001}
          step={0.1}
          disabled={disabled}
          onChange={(dampingRelaxation) =>
            patchSuspension({ dampingRelaxation: Math.max(0.001, dampingRelaxation) })
          }
        />
        <NumberField
          label="dampingCompression"
          value={value.suspension.dampingCompression}
          min={0.001}
          step={0.1}
          disabled={disabled}
          onChange={(dampingCompression) =>
            patchSuspension({ dampingCompression: Math.max(0.001, dampingCompression) })
          }
        />
        <NumberField
          label="rollInfluence"
          value={value.suspension.rollInfluence}
          min={0}
          step={0.001}
          disabled={disabled}
          onChange={(rollInfluence) => patchSuspension({ rollInfluence: Math.max(0, rollInfluence) })}
        />
      </div>

      <div className="mesh-renderer-fields__section">
        <SectionHeading>Engine</SectionHeading>
        <NumberField
          label="force"
          value={value.engine.force}
          min={0.001}
          step={10}
          disabled={disabled}
          hint="Direct engine force applied along chassis forward (Isaac Mason custom-raycast-vehicle sketch)."
          onChange={(force) => patchEngine({ force: Math.max(0.001, force) })}
        />
      </div>

      <div className="mesh-renderer-fields__section">
        <SectionHeading>Steering</SectionHeading>
        <NumberField
          label="maxSteer"
          value={value.steering.maxSteer}
          min={0.001}
          step={0.01}
          disabled={disabled}
          hint="Max steer angle (radians), applied directly from steer input with no smoothing."
          onChange={(maxSteer) => patchSteering({ maxSteer: Math.max(0.001, maxSteer) })}
        />
      </div>

      <div className="mesh-renderer-fields__section">
        <SectionHeading>Brakes</SectionHeading>
        <NumberField
          label="brakeForce"
          value={value.brakes.brakeForce}
          min={0.001}
          step={1}
          disabled={disabled}
          onChange={(brakeForce) => patchBrakes({ brakeForce: Math.max(0.001, brakeForce) })}
        />
      </div>
    </div>
  )
})

/** @deprecated use PhysicsControllerFields */
export const VehicleFields = PhysicsControllerFields
