import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CameraComponent,
  ColliderComponent,
  TransformComponent,
  PhysicsControllerComponent,
  World,
} from '@haku/core'
import { CustomRaycastControllerSchema, ColliderSchema, ArcadeVehicleControllerSchema } from '@haku/schema'
import type { Quat, Vec3 } from '@haku/schema'
import { resetStubPhysicsIds, StubPhysicsBackend } from '@haku/physics'
import { InputManager, type PointerCaptureTarget } from '../input/input-manager.js'
import {
  CHASE_BOOST_FOV,
  CHASE_CAMERA_OFFSET,
  CHASE_PITCH_MAX,
  CHASE_PITCH_MIN,
  applyChaseOrbitInput,
  applyChaseZoomInput,
  computeChaseCameraDesiredPose,
  computeChaseCameraStep,
  createChaseCameraRuntimeState,
  lookAtQuaternion,
  normalizeAngleRadians,
  resetChaseOrbitOnAccelerate,
  updateChaseAirborneBlend,
  updateChaseBoostBlend,
  updateChaseOrbitSmoothing,
  ChaseCameraSystem,
} from './chase-camera-system.js'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'
import { PhysicsControllerSystem } from './vehicle-controller-system.js'

const IDENTITY_ROTATION: Quat = [0, 0, 0, 1]
const INTEGRATION_DRIVE_VEHICLE = CustomRaycastControllerSchema.parse({ type: "custom-raycast", engine: { force: 800 } })

function vehicleState(overrides: Partial<{
  position: Vec3
  rotation: Quat
  grounded: boolean
  upwardSpeed: number
}> = {}) {
  return {
    position: [0, 1, 0] as Vec3,
    rotation: IDENTITY_ROTATION,
    grounded: true,
    upwardSpeed: 0,
    ...overrides,
  }
}

describe('normalizeAngleRadians', () => {
  it('wraps angles into [-PI, PI)', () => {
    expect(normalizeAngleRadians(Math.PI * 3)).toBeCloseTo(-Math.PI, 5)
    expect(normalizeAngleRadians(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2, 5)
  })
})

describe('applyChaseOrbitInput', () => {
  it('applies yaw from horizontal drag and clamps pitch', () => {
    const orbit = createChaseCameraRuntimeState([0, 0, 0], [0, 0, 0]).orbit
    applyChaseOrbitInput(orbit, 100, 0)
    expect(orbit.targetYaw).toBeCloseTo(-0.35, 4)

    applyChaseOrbitInput(orbit, 0, -500)
    expect(orbit.targetPitch).toBe(CHASE_PITCH_MAX)

    applyChaseOrbitInput(orbit, 0, 5000)
    expect(orbit.targetPitch).toBe(CHASE_PITCH_MIN)

    applyChaseOrbitInput(orbit, 0, -5000)
    expect(orbit.targetPitch).toBe(CHASE_PITCH_MAX)
  })
})

describe('applyChaseZoomInput', () => {
  it('clamps zoom within configured range', () => {
    const orbit = createChaseCameraRuntimeState([0, 0, 0], [0, 0, 0]).orbit
    applyChaseZoomInput(orbit, -1000)
    expect(orbit.targetZoom).toBeGreaterThanOrEqual(0.4)
    applyChaseZoomInput(orbit, 2000)
    expect(orbit.targetZoom).toBeLessThanOrEqual(1.5)
  })
})

describe('updateChaseOrbitSmoothing', () => {
  it('lerps yaw/pitch/zoom toward targets over time', () => {
    const orbit = createChaseCameraRuntimeState([0, 0, 0], [0, 0, 0]).orbit
    orbit.targetYaw = 0.5
    orbit.targetPitch = 0.2
    orbit.targetZoom = 1.2

    updateChaseOrbitSmoothing(orbit, 1 / 60)
    expect(orbit.yaw).toBeGreaterThan(0)
    expect(orbit.yaw).toBeLessThan(0.5)
    expect(orbit.pitch).toBeGreaterThan(0)
    expect(orbit.zoom).toBeGreaterThan(1)
  })
})

describe('resetChaseOrbitOnAccelerate', () => {
  it('pulls orbit targets toward neutral while accelerating', () => {
    const orbit = createChaseCameraRuntimeState([0, 0, 0], [0, 0, 0]).orbit
    orbit.targetYaw = 0.8
    orbit.targetPitch = 0.3

    for (let i = 0; i < 120; i++) {
      resetChaseOrbitOnAccelerate(orbit, true, 1 / 60)
      updateChaseOrbitSmoothing(orbit, 1 / 60)
    }

    expect(Math.abs(orbit.targetYaw)).toBeLessThan(0.05)
    expect(Math.abs(orbit.targetPitch)).toBeLessThan(0.05)
  })
})

describe('updateChaseAirborneBlend', () => {
  it('ramps blend up when airborne and back down when grounded', () => {
    let blend = 0
    for (let i = 0; i < 30; i++) {
      blend = updateChaseAirborneBlend(blend, false, 6, 1 / 60)
    }
    expect(blend).toBeGreaterThan(0.4)

    for (let i = 0; i < 60; i++) {
      blend = updateChaseAirborneBlend(blend, true, 0, 1 / 60)
    }
    expect(blend).toBeLessThan(0.1)
  })
})

describe('updateChaseBoostBlend', () => {
  it('lerps toward 1 while boosting and back to 0 when released', () => {
    let blend = 0
    for (let i = 0; i < 30; i++) {
      blend = updateChaseBoostBlend(blend, true, 1 / 60)
    }
    expect(blend).toBeGreaterThan(0.5)

    for (let i = 0; i < 60; i++) {
      blend = updateChaseBoostBlend(blend, false, 1 / 60)
    }
    expect(blend).toBeLessThan(0.05)
  })
})

describe('computeChaseCameraDesiredPose', () => {
  it('places camera behind vehicle with configured offset', () => {
    const runtime = createChaseCameraRuntimeState([0, 0, 0], [0, 0, 0])
    const pose = computeChaseCameraDesiredPose(vehicleState(), runtime)

    expect(pose.position[1]).toBeGreaterThan(vehicleState().position[1])
    expect(pose.position[2]).toBeCloseTo(CHASE_CAMERA_OFFSET[2], 1)
    expect(pose.lookTarget[2]).toBeGreaterThan(vehicleState().position[2])
  })

  it('uses wider airborne offsets when wheels are off ground', () => {
    const groundedRuntime = createChaseCameraRuntimeState([0, 0, 0], [0, 0, 0])
    groundedRuntime.airborneBlend = 0
    const groundedPose = computeChaseCameraDesiredPose(vehicleState(), groundedRuntime)

    const airborneRuntime = createChaseCameraRuntimeState([0, 0, 0], [0, 0, 0])
    airborneRuntime.airborneBlend = 1
    const airbornePose = computeChaseCameraDesiredPose(
      vehicleState({ grounded: false, upwardSpeed: 8 }),
      airborneRuntime,
    )

    expect(airbornePose.position[1]).toBeGreaterThan(groundedPose.position[1])
    expect(airbornePose.position[2]).toBeLessThan(groundedPose.position[2])
  })
})

describe('computeChaseCameraStep', () => {
  it('smoothly follows vehicle position over multiple frames', () => {
    const runtime = createChaseCameraRuntimeState([0, 5, -7], [0, 1, 3])
    const start = computeChaseCameraStep(
      runtime,
      vehicleState({ position: [0, 1, 0] }),
      { orbitDx: 0, orbitDy: 0, zoomDelta: 0, boost: false, throttle: 0, dragging: false },
      { dt: 1 / 60, baseFov: 60 },
    )

    const moved = computeChaseCameraStep(
      runtime,
      vehicleState({ position: [0, 1, 20] }),
      { orbitDx: 0, orbitDy: 0, zoomDelta: 0, boost: false, throttle: 0, dragging: false },
      { dt: 1 / 60, baseFov: 60 },
    )

    expect(moved.position[2]).toBeGreaterThan(start.position[2])
    expect(moved.position[2]).toBeLessThan(20 + CHASE_CAMERA_OFFSET[2])
  })

  it('widens FOV while boosting', () => {
    const runtime = createChaseCameraRuntimeState([0, 5, -7], [0, 1, 3])
    let fov = 60
    for (let i = 0; i < 60; i++) {
      const pose = computeChaseCameraStep(
        runtime,
        vehicleState(),
        { orbitDx: 0, orbitDy: 0, zoomDelta: 0, boost: true, throttle: 1, dragging: false },
        { dt: 1 / 60, baseFov: 60 },
      )
      fov = pose.fov
    }
    expect(fov).toBeGreaterThan(65)
    expect(fov).toBeLessThanOrEqual(CHASE_BOOST_FOV)
  })
})

describe('lookAtQuaternion', () => {
  function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
    const [x, y, z] = v
    const [qx, qy, qz, qw] = q
    const ix = qw * x + qy * z - qz * y
    const iy = qw * y + qz * x - qx * z
    const iz = qw * z + qx * y - qy * x
    const iw = -qx * x - qy * y - qz * z
    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ]
  }

  it('points camera -Z toward the look target', () => {
    const eye: Vec3 = [0, 5, -10]
    const target: Vec3 = [0, 1, 0]
    const q = lookAtQuaternion(eye, target)
    const viewDir = rotateVec3ByQuat([0, 0, -1], q)
    const expected = [
      target[0] - eye[0],
      target[1] - eye[1],
      target[2] - eye[2],
    ] as Vec3
    const len = Math.hypot(expected[0], expected[1], expected[2])
    expected[0] /= len
    expected[1] /= len
    expected[2] /= len
    expect(viewDir[0]).toBeCloseTo(expected[0], 3)
    expect(viewDir[1]).toBeCloseTo(expected[1], 3)
    expect(viewDir[2]).toBeCloseTo(expected[2], 3)
  })
})

type Listener = (event: unknown) => void

class MockPointerTarget {
  private listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener, _options?: unknown): void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string, event: unknown): void {
    const set = this.listeners.get(type)
    if (!set) return
    for (const listener of [...set]) {
      listener(event)
    }
  }
}

describe('ChaseCameraSystem integration (stub)', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  function createVehicleCameraScene() {
    const backend = new StubPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({
      fixedTimestep: 1 / 60,
      maxSubsteps: 120,
    })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)
    const vehicleSystem = new PhysicsControllerSystem(physicsSystem)
    const inputManager = new InputManager({
      keyboardTarget: new MockPointerTarget() as unknown as EventTarget,
      pointerTarget: new MockPointerTarget() as unknown as PointerCaptureTarget,
    })
    inputManager.attach()
    inputManager.enable()
    const chaseCamera = new ChaseCameraSystem(inputManager, physicsSystem, vehicleSystem)

    const world = new World()

    const groundId = world.createEntity('Ground')
    world.addComponent(groundId, TransformComponent, {
      position: [0, -0.1, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(groundId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [30, 0.1, 30],
    }))

    const carId = world.createEntity('Car')
    world.addComponent(carId, TransformComponent, {
      position: [0, 1.05, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(carId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [0.9, 0.3, 1.55],
    }))
    world.addComponent(carId, PhysicsControllerComponent, INTEGRATION_DRIVE_VEHICLE)

    const cameraId = world.createEntity('ChaseCamera')
    world.addComponent(cameraId, TransformComponent, {
      position: [0, 8, -12],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(cameraId, CameraComponent, {
      fov: 60,
      near: 0.1,
      far: 1000,
      enabled: true,
    })

    colliderSystem.bootstrap(world)
    vehicleSystem.bootstrap(world)

    return {
      world,
      physicsSystem,
      colliderSystem,
      vehicleSystem,
      chaseCamera,
      inputManager,
      carId,
      cameraId,
    }
  }

  afterEach(() => {
    // no-op — dispose per test
  })

  it('tracks vehicle transform over simulated drive', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, chaseCamera, carId, cameraId } =
      createVehicleCameraScene()

    vehicleSystem.setVehicleInput(carId, { throttle: 1 })

    for (let i = 0; i < 180; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
      chaseCamera.update(world, 1 / 60)
    }

    const carZ = world.getComponent(carId, TransformComponent)?.position[2] ?? 0
    const cameraZ = world.getComponent(cameraId, TransformComponent)?.position[2] ?? 0
    expect(carZ).toBeGreaterThan(0.25)
    expect(cameraZ).toBeGreaterThan(-10)
    expect(cameraZ).toBeLessThan(carZ + 1)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
    chaseCamera.dispose()
  })

  it('increases FOV when boost input is active during drive', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, chaseCamera, inputManager, carId, cameraId } =
      createVehicleCameraScene()

    vehicleSystem.setVehicleInput(carId, { throttle: 1, boost: true })
    inputManager.getActions()

    let fov = 60
    for (let i = 0; i < 60; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
      chaseCamera.update(world, 1 / 60)
      fov = world.getComponent(cameraId, CameraComponent)?.fov ?? 60
    }

    expect(fov).toBeGreaterThan(62)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
    chaseCamera.dispose()
    inputManager.detach()
  })

  it('raises airborne blend after jump leaves the ground', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, chaseCamera, carId } =
      createVehicleCameraScene()

    world.addComponent(
      carId,
      PhysicsControllerComponent,
      ArcadeVehicleControllerSchema.parse({ type: 'arcade-vehicle', jumpImpulse: 5000 }),
    )
    colliderSystem.dispose()
    vehicleSystem.dispose()
    colliderSystem.bootstrap(world)
    vehicleSystem.bootstrap(world)

    for (let i = 0; i < 30; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
      chaseCamera.update(world, 1 / 60)
    }

    vehicleSystem.setVehicleInput(carId, { jump: true })
    for (let i = 0; i < 5; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
      chaseCamera.update(world, 1 / 60)
    }

    const yBefore = world.getComponent(carId, TransformComponent)?.position[1] ?? 0
    for (let i = 0; i < 30; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
      chaseCamera.update(world, 1 / 60)
    }
    const yAfter = world.getComponent(carId, TransformComponent)?.position[1] ?? 0
    expect(yAfter).toBeGreaterThan(yBefore + 0.2)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
    chaseCamera.dispose()
  })
})
