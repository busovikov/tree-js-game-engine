import { describe, expect, it } from 'vitest'
import {
  ArcadeVehicleControllerSchema,
  ControllerChassisSchema,
  ControllerSuspensionSchema,
  ControllerWheelsSchema,
  CustomRaycastBrakesSchema,
  CustomRaycastControllerSchema,
  CustomRaycastEngineSchema,
  CustomRaycastSteeringSchema,
  DynamicRaycastControllerSchema,
  KinematicCharacterControllerSchema,
  CharacterBodyControllerSchema,
  PointerControlsControllerSchema,
  RevoluteJointVehicleControllerSchema,
  controllerNeedsCapsule,
  controllerNeedsChassis,
  controllerWheelLocalPositions,
} from './physics-controller.js'

describe('controller component schemas', () => {
  it.each([
    ['CustomRaycastController', CustomRaycastControllerSchema],
    ['DynamicRaycastController', DynamicRaycastControllerSchema],
    ['ArcadeVehicleController', ArcadeVehicleControllerSchema],
    ['RevoluteJointVehicleController', RevoluteJointVehicleControllerSchema],
    ['KinematicCharacterController', KinematicCharacterControllerSchema],
    ['CharacterBodyController', CharacterBodyControllerSchema],
    ['PointerControlsController', PointerControlsControllerSchema],
  ] as const)('parses defaults for %s', (_id, schema) => {
    const controller = schema.parse({})

    expect(controller.enabled).toBe(true)
    expect(controller.physicsHandle).toBeUndefined()
  })

  it('applies custom-raycast grouped defaults and preserves partial overrides', () => {
    const controller = CustomRaycastControllerSchema.parse({
      engine: { force: 45 },
    })

    expect(controller.chassis).toMatchObject({
      mass: 250,
      halfExtents: [0.9, 0.3, 1.55],
      lift: 0.5,
    })
    expect(controller.wheels).toMatchObject({
      radius: 0.42,
      halfWidth: 0.95,
      height: 0.35,
      halfLength: 1.55,
    })
    expect(controller.suspension).toMatchObject({
      stiffness: 30,
      restLength: 0.55,
      maxTravel: 0.42,
    })
    expect(controller.engine.force).toBe(45)
    expect(controller.steering.maxSteer).toBe(10)
    expect(controller.brakes.brakeForce).toBe(2)
  })

  it('applies defaults specific to every non-custom-raycast variant', () => {
    expect(DynamicRaycastControllerSchema.parse({})).toMatchObject({
      driveProfile: 'default',
      accelerateForce: 2,
      steerLerp: 0.25,
    })
    expect(ArcadeVehicleControllerSchema.parse({})).toMatchObject({
      maxForwardSpeed: 8,
      maxReverseSpeed: -1,
      speedLerp: 0.03,
    })
    const revolute = RevoluteJointVehicleControllerSchema.parse({})
    expect(revolute).toMatchObject({
      wheelRadius: 0.4,
      wheelMass: 1.5,
      hubMass: 3,
      suspensionRestLength: 0.5,
      suspensionStiffness: 800,
      suspensionDamping: 320,
      suspensionTravel: 0.4,
      drivenTargetVelocity: 40,
      drivenFactor: 2500,
      steerStiffness: 200000,
    })
    expect(revolute.wheels).toHaveLength(4)
    expect(revolute.wheels[0]).toMatchObject({ isSteered: true, isDriven: false })
    expect(revolute.wheels[2]).toMatchObject({ isSteered: false, isDriven: true })
    expect(KinematicCharacterControllerSchema.parse({})).toMatchObject({
      capsuleRadius: 0.35,
      moveSpeed: 1,
      velocityXZSmoothing: 0.2,
    })
    expect(PointerControlsControllerSchema.parse({})).toMatchObject({
      draggable: true,
      constraintType: 'spherical',
      ropeLength: 0.5,
    })
  })

  it('rejects non-finite / non-positive revolute wheel mass and drive velocity', () => {
    expect(() => RevoluteJointVehicleControllerSchema.parse({ wheelMass: 0 })).toThrow()
    expect(() =>
      RevoluteJointVehicleControllerSchema.parse({
        wheelMass: Number.POSITIVE_INFINITY,
      }),
    ).toThrow()
    expect(() =>
      RevoluteJointVehicleControllerSchema.parse({
        drivenTargetVelocity: Number.NaN,
      }),
    ).toThrow()
  })

  it('accepts the shared runtime-only physics handle', () => {
    const controller = PointerControlsControllerSchema.parse({
      physicsHandle: 'pointer-joint-7',
    })

    expect(controller.physicsHandle).toBe('pointer-joint-7')
  })

  it('derives wheel positions in front-left, front-right, back-left, back-right order', () => {
    const wheels = ControllerWheelsSchema.parse({})

    expect(controllerWheelLocalPositions(wheels)).toEqual([
      [-0.95, 0.35, 1.55],
      [0.95, 0.35, 1.55],
      [-0.95, 0.35, -1.55],
      [0.95, 0.35, -1.55],
    ])
  })

  it('classifies chassis vs capsule controller ids', () => {
    expect(controllerNeedsChassis('40000000-0000-4000-8000-000000000015')).toBe(true)
    expect(controllerNeedsChassis('40000000-0000-4000-8000-000000000019')).toBe(false)
    expect(controllerNeedsCapsule('40000000-0000-4000-8000-000000000020')).toBe(true)
    expect(controllerNeedsCapsule('40000000-0000-4000-8000-000000000021')).toBe(false)
  })

  it('rejects invalid shared vehicle parameter groups', () => {
    expect(() => ControllerChassisSchema.parse({ mass: 0 })).toThrow()
    expect(() => ControllerWheelsSchema.parse({ radius: -0.1 })).toThrow()
    expect(() => ControllerSuspensionSchema.parse({ stiffness: 0 })).toThrow()
    expect(() => CustomRaycastEngineSchema.parse({ force: 0 })).toThrow()
    expect(() => CustomRaycastSteeringSchema.parse({ maxSteer: 0 })).toThrow()
    expect(() => CustomRaycastBrakesSchema.parse({ brakeForce: 0 })).toThrow()
  })

  it.each([
    [CustomRaycastControllerSchema, { engine: { force: 0 } }],
    [DynamicRaycastControllerSchema, { accelerateForce: 0 }],
    [ArcadeVehicleControllerSchema, { speedLerp: 1.1 }],
    [RevoluteJointVehicleControllerSchema, { wheels: [] }],
    [KinematicCharacterControllerSchema, { velocityXZSmoothing: -0.1 }],
    [PointerControlsControllerSchema, { ropeLength: 0 }],
  ] as const)('rejects invalid controller data', (schema, invalidData) => {
    expect(() => schema.parse(invalidData)).toThrow()
  })
})
