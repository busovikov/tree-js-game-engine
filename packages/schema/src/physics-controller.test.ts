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
  PhysicsControllerSchema,
  PointerControlsControllerSchema,
  RevoluteJointVehicleControllerSchema,
  controllerWheelLocalPositions,
} from './physics-controller.js'

describe('PhysicsControllerSchema', () => {
  it.each([
    ['custom-raycast', CustomRaycastControllerSchema],
    ['dynamic-raycast', DynamicRaycastControllerSchema],
    ['arcade-vehicle', ArcadeVehicleControllerSchema],
    ['revolute-joint-vehicle', RevoluteJointVehicleControllerSchema],
    ['kinematic-character', KinematicCharacterControllerSchema],
    ['pointer-controls', PointerControlsControllerSchema],
  ] as const)('parses the %s discriminated variant', (type, schema) => {
    const controller = PhysicsControllerSchema.parse({ type })

    expect(controller).toEqual(schema.parse({ type }))
    expect(controller.enabled).toBe(true)
    expect(controller.physicsHandle).toBeUndefined()
  })

  it('applies custom-raycast grouped defaults and preserves partial overrides', () => {
    const controller = CustomRaycastControllerSchema.parse({
      type: 'custom-raycast',
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
    expect(DynamicRaycastControllerSchema.parse({ type: 'dynamic-raycast' })).toMatchObject({
      driveProfile: 'default',
      accelerateForce: 2,
      steerLerp: 0.25,
    })
    expect(ArcadeVehicleControllerSchema.parse({ type: 'arcade-vehicle' })).toMatchObject({
      maxForwardSpeed: 8,
      maxReverseSpeed: -1,
      speedLerp: 0.03,
    })
    const revolute = RevoluteJointVehicleControllerSchema.parse({
      type: 'revolute-joint-vehicle',
    })
    expect(revolute).toMatchObject({
      wheelRadius: 0.4,
      drivenTargetVelocity: 1_000,
    })
    expect(revolute.wheels).toHaveLength(4)
    expect(
      KinematicCharacterControllerSchema.parse({ type: 'kinematic-character' }),
    ).toMatchObject({
      capsuleRadius: 0.35,
      moveSpeed: 1,
      velocityXZSmoothing: 0.2,
    })
    expect(PointerControlsControllerSchema.parse({ type: 'pointer-controls' })).toMatchObject({
      draggable: true,
      constraintType: 'spherical',
      ropeLength: 0.5,
    })
  })

  it('accepts the shared runtime-only physics handle', () => {
    const controller = PhysicsControllerSchema.parse({
      type: 'pointer-controls',
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

  it('rejects unknown or missing discriminators', () => {
    expect(() => PhysicsControllerSchema.parse({ type: 'vehicle' })).toThrow()
    expect(() => PhysicsControllerSchema.parse({})).toThrow()
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
    ['custom-raycast', { engine: { force: 0 } }],
    ['dynamic-raycast', { accelerateForce: 0 }],
    ['arcade-vehicle', { speedLerp: 1.1 }],
    ['revolute-joint-vehicle', { wheels: [] }],
    ['kinematic-character', { velocityXZSmoothing: -0.1 }],
    ['pointer-controls', { ropeLength: 0 }],
  ] as const)('rejects invalid %s controller data', (type, invalidData) => {
    expect(() => PhysicsControllerSchema.parse({ type, ...invalidData })).toThrow()
  })
})
