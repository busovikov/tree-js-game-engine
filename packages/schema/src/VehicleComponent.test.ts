import { describe, expect, it } from 'vitest'
import {
  VehicleSchema,
  VehicleChassisSchema,
  VehicleWheelsSchema,
  VehicleSuspensionSchema,
  VehicleEngineSchema,
  VehicleSteeringSchema,
  VehicleBrakesSchema,
  VehicleJumpSchema,
  VehicleAssistsSchema,
  vehicleWheelLocalPositions,
} from './vehicle.js'

describe('VehicleSchema', () => {
  it('defaults match reference order-of-magnitude', () => {
    const vehicle = VehicleSchema.parse({})

    expect(vehicle.chassis.mass).toBe(250)
    expect(vehicle.chassis.halfExtents).toEqual([0.9, 0.3, 1.55])
    expect(vehicle.chassis.lift).toBe(0.5)
    expect(vehicle.chassis.angularDamping).toBe(0.12)
    expect(vehicle.chassis.inertiaScale).toBe(3)

    expect(vehicle.wheels.radius).toBe(0.42)
    expect(vehicle.wheels.halfWidth).toBe(0.95)
    expect(vehicle.wheels.height).toBe(0.35)
    expect(vehicle.wheels.halfLength).toBe(1.55)

    expect(vehicle.suspension.stiffness).toBe(70)
    expect(vehicle.suspension.restLength).toBe(0.55)
    expect(vehicle.suspension.maxTravel).toBe(0.42)
    expect(vehicle.suspension.frictionSlip).toBe(7.8)
    expect(vehicle.suspension.dampingRelaxation).toBe(3.5)
    expect(vehicle.suspension.dampingCompression).toBe(4.4)

    expect(vehicle.engine.force).toBe(1400)
    expect(vehicle.engine.boostMultiplier).toBe(1.8)
    expect(vehicle.engine.cruiseSpeedKmh).toBe(90)
    expect(vehicle.engine.maxSpeedKmh).toBe(140)

    expect(vehicle.steering.maxSteer).toBe(0.55)
    expect(vehicle.steering.steerSpeed).toBe(6)

    expect(vehicle.brakes.brakeForce).toBe(18)
    expect(vehicle.brakes.handbrakeForce).toBe(32)

    expect(vehicle.jump.impulse).toBe(2000)
    expect(vehicle.jump.cooldown).toBe(0.5)
    expect(vehicle.jump.bufferTime).toBe(0.18)
    expect(vehicle.jump.airborneGravityScale).toBe(2)

    expect(vehicle.assists.antiWheelie).toBe(true)
    expect(vehicle.assists.uprightAssist).toBe(true)
    expect(vehicle.assists.wallSlideAssist).toBe(true)
    expect(vehicle.enabled).toBe(true)
    expect(vehicle.physicsVehicleHandle).toBeUndefined()
  })

  it('derives four wheel local positions from connection pattern', () => {
    const wheels = VehicleWheelsSchema.parse({})
    expect(vehicleWheelLocalPositions(wheels)).toEqual([
      [-0.95, 0.35, 1.55],
      [0.95, 0.35, 1.55],
      [-0.95, 0.35, -1.55],
      [0.95, 0.35, -1.55],
    ])
  })

  it('parses partial overrides while preserving grouped defaults', () => {
    const vehicle = VehicleSchema.parse({
      engine: { force: 2000 },
      jump: { impulse: 2500 },
    })
    expect(vehicle.engine.force).toBe(2000)
    expect(vehicle.engine.boostMultiplier).toBe(1.8)
    expect(vehicle.jump.impulse).toBe(2500)
    expect(vehicle.chassis.mass).toBe(250)
  })

  it('accepts optional runtime physicsVehicleHandle', () => {
    const vehicle = VehicleSchema.parse({ physicsVehicleHandle: 'vehicle-7' })
    expect(vehicle.physicsVehicleHandle).toBe('vehicle-7')
  })

  it('rejects non-positive chassis mass', () => {
    expect(() => VehicleChassisSchema.parse({ mass: 0 })).toThrow()
    expect(() => VehicleChassisSchema.parse({ mass: -10 })).toThrow()
  })

  it('rejects non-positive wheel radius', () => {
    expect(() => VehicleWheelsSchema.parse({ radius: 0 })).toThrow()
  })

  it('rejects negative suspension stiffness', () => {
    expect(() => VehicleSuspensionSchema.parse({ stiffness: -1 })).toThrow()
  })

  it('rejects invalid engine reverseFactor', () => {
    expect(() => VehicleEngineSchema.parse({ reverseFactor: 1.5 })).toThrow()
    expect(() => VehicleEngineSchema.parse({ reverseFactor: -0.1 })).toThrow()
  })

  it('rejects non-positive steering limits', () => {
    expect(() => VehicleSteeringSchema.parse({ maxSteer: 0 })).toThrow()
    expect(() => VehicleSteeringSchema.parse({ steerSpeed: -1 })).toThrow()
  })

  it('rejects non-positive brake forces', () => {
    expect(() => VehicleBrakesSchema.parse({ brakeForce: 0 })).toThrow()
    expect(() => VehicleBrakesSchema.parse({ handbrakeForce: -5 })).toThrow()
  })

  it('rejects sub-unity airborne gravity scale', () => {
    expect(() => VehicleJumpSchema.parse({ airborneGravityScale: 0.5 })).toThrow()
  })

  it('rejects out-of-range assist factors', () => {
    expect(() => VehicleAssistsSchema.parse({ cornerLiftDamping: 1.5 })).toThrow()
    expect(() => VehicleAssistsSchema.parse({ landingGripFactor: 1.2 })).toThrow()
  })
})
