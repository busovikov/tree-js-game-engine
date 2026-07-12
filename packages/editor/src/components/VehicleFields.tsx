import { memo } from 'react'
import { CustomRaycastControllerSchema, type CustomRaycastController } from '@haku/schema'
import { NumberField } from './NumberField.js'
import './mesh-renderer-fields.css'

export function normalizeCustomRaycastController(data: unknown): CustomRaycastController {
  const base = typeof data === 'object' && data !== null ? data : {}
  return CustomRaycastControllerSchema.parse({ type: 'custom-raycast', ...base })
}

/** @deprecated use normalizeCustomRaycastController */
export const normalizeVehicle = normalizeCustomRaycastController

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

export const CustomRaycastControllerFields = memo(function CustomRaycastControllerFields({
  value,
  onChange,
  disabled,
}: {
  value: CustomRaycastController
  onChange?: (next: CustomRaycastController) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<CustomRaycastController>) => onChange?.({ ...value, ...partial })

  const patchChassis = (partial: Partial<CustomRaycastController['chassis']>) =>
    patch({ chassis: { ...value.chassis, ...partial } })

  const patchWheels = (partial: Partial<CustomRaycastController['wheels']>) =>
    patch({ wheels: { ...value.wheels, ...partial } })

  const patchSuspension = (partial: Partial<CustomRaycastController['suspension']>) =>
    patch({ suspension: { ...value.suspension, ...partial } })

  const patchEngine = (partial: Partial<CustomRaycastController['engine']>) =>
    patch({ engine: { ...value.engine, ...partial } })

  const patchSteering = (partial: Partial<CustomRaycastController['steering']>) =>
    patch({ steering: { ...value.steering, ...partial } })

  const patchBrakes = (partial: Partial<CustomRaycastController['brakes']>) =>
    patch({ brakes: { ...value.brakes, ...partial } })

  const patchJump = (partial: Partial<CustomRaycastController['jump']>) =>
    patch({ jump: { ...value.jump, ...partial } })

  const patchAssists = (partial: Partial<CustomRaycastController['assists']>) =>
    patch({ assists: { ...value.assists, ...partial } })

  const patchChassisHalfExtents = (axis: 0 | 1 | 2, num: number) => {
    const next = [...value.chassis.halfExtents] as [number, number, number]
    next[axis] = Math.max(0.001, num)
    patchChassis({ halfExtents: next })
  }

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <SectionHeading>Chassis</SectionHeading>
        <p className="mesh-renderer-fields__hint" title="Raycast vehicle physics body — no separate Collider component.">
          Implicit physics box (orange wireframe in viewport). Edit halfExtents and lift below; remove CustomRaycastController
          component to hide it.
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
          label="width"
          value={value.wheels.width}
          min={0.001}
          step={0.01}
          disabled={disabled}
          hint="Visual tire width."
          onChange={(width) => patchWheels({ width: Math.max(0.001, width) })}
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
          onChange={(force) => patchEngine({ force: Math.max(0.001, force) })}
        />
        <NumberField
          label="boostMultiplier"
          value={value.engine.boostMultiplier}
          min={0.001}
          step={0.1}
          disabled={disabled}
          onChange={(boostMultiplier) => patchEngine({ boostMultiplier: Math.max(0.001, boostMultiplier) })}
        />
        <NumberField
          label="cruiseSpeedKmh"
          value={value.engine.cruiseSpeedKmh}
          min={0.001}
          step={1}
          disabled={disabled}
          onChange={(cruiseSpeedKmh) => patchEngine({ cruiseSpeedKmh: Math.max(0.001, cruiseSpeedKmh) })}
        />
        <NumberField
          label="maxSpeedKmh"
          value={value.engine.maxSpeedKmh}
          min={0.001}
          step={1}
          disabled={disabled}
          onChange={(maxSpeedKmh) => patchEngine({ maxSpeedKmh: Math.max(0.001, maxSpeedKmh) })}
        />
        <NumberField
          label="reverseFactor"
          value={value.engine.reverseFactor}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(reverseFactor) =>
            patchEngine({ reverseFactor: Math.min(1, Math.max(0, reverseFactor)) })
          }
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
          onChange={(maxSteer) => patchSteering({ maxSteer: Math.max(0.001, maxSteer) })}
        />
        <NumberField
          label="steerSpeed"
          value={value.steering.steerSpeed}
          min={0.001}
          step={0.1}
          disabled={disabled}
          onChange={(steerSpeed) => patchSteering({ steerSpeed: Math.max(0.001, steerSpeed) })}
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
        <NumberField
          label="handbrakeForce"
          value={value.brakes.handbrakeForce}
          min={0.001}
          step={1}
          disabled={disabled}
          onChange={(handbrakeForce) => patchBrakes({ handbrakeForce: Math.max(0.001, handbrakeForce) })}
        />
      </div>

      <div className="mesh-renderer-fields__section">
        <SectionHeading>Jump</SectionHeading>
        <NumberField
          label="impulse"
          value={value.jump.impulse}
          min={0.001}
          step={10}
          disabled={disabled}
          onChange={(impulse) => patchJump({ impulse: Math.max(0.001, impulse) })}
        />
        <NumberField
          label="cooldown"
          value={value.jump.cooldown}
          min={0}
          step={0.05}
          disabled={disabled}
          onChange={(cooldown) => patchJump({ cooldown: Math.max(0, cooldown) })}
        />
        <NumberField
          label="bufferTime"
          value={value.jump.bufferTime}
          min={0}
          step={0.01}
          disabled={disabled}
          onChange={(bufferTime) => patchJump({ bufferTime: Math.max(0, bufferTime) })}
        />
        <NumberField
          label="airborneGravityScale"
          value={value.jump.airborneGravityScale}
          min={1}
          step={0.1}
          disabled={disabled}
          onChange={(airborneGravityScale) =>
            patchJump({ airborneGravityScale: Math.max(1, airborneGravityScale) })
          }
        />
      </div>

      <div className="mesh-renderer-fields__section">
        <SectionHeading>Assists</SectionHeading>
        <label className="mesh-field mesh-field--checkbox">
          <input
            type="checkbox"
            checked={value.assists.antiWheelie}
            disabled={disabled}
            onChange={(event) => patchAssists({ antiWheelie: event.target.checked })}
          />
          <span className="mesh-field__label">antiWheelie</span>
        </label>
        <label className="mesh-field mesh-field--checkbox">
          <input
            type="checkbox"
            checked={value.assists.uprightAssist}
            disabled={disabled}
            onChange={(event) => patchAssists({ uprightAssist: event.target.checked })}
          />
          <span className="mesh-field__label">uprightAssist</span>
        </label>
        <label className="mesh-field mesh-field--checkbox">
          <input
            type="checkbox"
            checked={value.assists.wallSlideAssist}
            disabled={disabled}
            onChange={(event) => patchAssists({ wallSlideAssist: event.target.checked })}
          />
          <span className="mesh-field__label">wallSlideAssist</span>
        </label>
        <NumberField
          label="tiltClampAirborne"
          value={value.assists.tiltClampAirborne}
          min={0}
          step={0.1}
          disabled={disabled}
          onChange={(tiltClampAirborne) => patchAssists({ tiltClampAirborne: Math.max(0, tiltClampAirborne) })}
        />
        <NumberField
          label="wallSlideMaxSpeedKmh"
          value={value.assists.wallSlideMaxSpeedKmh}
          min={0}
          step={1}
          disabled={disabled}
          onChange={(wallSlideMaxSpeedKmh) =>
            patchAssists({ wallSlideMaxSpeedKmh: Math.max(0, wallSlideMaxSpeedKmh) })
          }
        />
        <NumberField
          label="wallSlideStrength"
          value={value.assists.wallSlideStrength}
          min={0}
          step={0.1}
          disabled={disabled}
          onChange={(wallSlideStrength) => patchAssists({ wallSlideStrength: Math.max(0, wallSlideStrength) })}
        />
        <NumberField
          label="cornerLiftDamping"
          value={value.assists.cornerLiftDamping}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(cornerLiftDamping) =>
            patchAssists({ cornerLiftDamping: Math.min(1, Math.max(0, cornerLiftDamping)) })
          }
        />
        <NumberField
          label="gripLoadCap"
          value={value.assists.gripLoadCap}
          min={0.001}
          step={0.1}
          disabled={disabled}
          onChange={(gripLoadCap) => patchAssists({ gripLoadCap: Math.max(0.001, gripLoadCap) })}
        />
        <NumberField
          label="landingGripTime"
          value={value.assists.landingGripTime}
          min={0}
          step={0.05}
          disabled={disabled}
          onChange={(landingGripTime) => patchAssists({ landingGripTime: Math.max(0, landingGripTime) })}
        />
        <NumberField
          label="landingGripFactor"
          value={value.assists.landingGripFactor}
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(landingGripFactor) =>
            patchAssists({ landingGripFactor: Math.min(1, Math.max(0, landingGripFactor)) })
          }
        />
      </div>
    </div>
  )
})

/** @deprecated use PhysicsControllerFields */
export const VehicleFields = CustomRaycastControllerFields
