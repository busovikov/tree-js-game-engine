import { describe, expect, it } from 'vitest'
import { PhysicsControllerComponent, TransformComponent, World } from '@haku/core'
import { StubPhysicsBackend, physicsBodyHandle } from '@haku/physics'
import {
  updateArcadeVehicle,
  updateCustomSpring,
  type TrackedArcadeVehicle,
} from './physics-controller-runtime.js'
import { PhysicsWorldSystem } from './physics-world-system.js'

const identityRotation: [number, number, number, number] = [0, 0, 0, 1]

function createSpringSimulation(targetEntityId?: string) {
  const world = new World()
  const springId = world.createEntity('Spring')
  const targetId = world.createEntity('Target')
  const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
  physicsSystem.setBackend(new StubPhysicsBackend())
  const physicsWorld = physicsSystem.getPhysicsWorld()
  if (!physicsWorld) {
    throw new Error('Expected initialized physics world')
  }

  world.addComponent(springId, TransformComponent, {
    position: [0, 0, 0],
    rotation: identityRotation,
    scale: [1, 1, 1],
  })
  world.addComponent(targetId, TransformComponent, {
    position: [2, 0, 0],
    rotation: identityRotation,
    scale: [1, 1, 1],
  })
  world.addComponent(
    springId,
    PhysicsControllerComponent,
    PhysicsControllerComponent.schema.parse({
      type: 'custom-spring',
      enabled: true,
      targetEntityId: targetEntityId ?? targetId.value,
      localAnchorA: [0, 0, 0],
      localAnchorB: [0, 0, 0],
      stiffness: 6,
      damping: 2,
      restLength: 1,
    }),
  )

  const springBody = physicsWorld.createBody({
    type: 'dynamic',
    transform: { position: [0, 0, 0], rotation: identityRotation },
    mass: 1,
  })
  const targetBody = physicsWorld.createBody({
    type: 'dynamic',
    transform: { position: [2, 0, 0], rotation: identityRotation },
    mass: 1,
  })
  physicsSystem.registerBody(springId, springBody, 'dynamic', world)
  physicsSystem.registerBody(targetId, targetBody, 'dynamic', world)

  return { world, springId, targetId, physicsSystem, physicsWorld }
}

function simulateSpring(frameDts: readonly number[]) {
  const simulation = createSpringSimulation()
  for (const dt of frameDts) {
    updateCustomSpring(simulation.world, simulation.physicsWorld, simulation.physicsSystem)
    simulation.physicsSystem.update(simulation.world, dt)
  }
  return {
    springX: simulation.physicsSystem.getBodyTransform(simulation.springId)?.position[0] ?? 0,
    targetX: simulation.physicsSystem.getBodyTransform(simulation.targetId)?.position[0] ?? 0,
  }
}

function simulateArcadeSpeed(fps: 30 | 60 | 120): number {
  const world = new World()
  const carId = world.createEntity('Arcade car')
  world.addComponent(carId, TransformComponent, {
    position: [0, 0, 0],
    rotation: identityRotation,
    scale: [1, 1, 1],
  })
  world.addComponent(
    carId,
    PhysicsControllerComponent,
    PhysicsControllerComponent.schema.parse({
      type: 'arcade-vehicle',
    }),
  )

  const state: TrackedArcadeVehicle = { currentSpeed: 0, jumpCooldown: 0 }
  const tracked = new Map([[carId.value, state]])
  const inputs = new Map([[carId.value, { throttle: 1 }]])
  const bodyHandle = physicsBodyHandle('arcade-car')
  const physicsWorld = {
    raycast: () => ({
      body: bodyHandle,
      point: [0, 0, 0],
      normal: [0, 1, 0],
      distance: 1,
    }),
  } as never
  const physicsSystem = {
    getBodyHandle: () => bodyHandle,
    getBodyLinearVelocity: () => [0, 0, 0],
    setBodyLinearVelocity: () => {},
    getBodyAngularVelocity: () => [0, 0, 0],
    setBodyAngularVelocity: () => {},
  } as never

  for (let frame = 0; frame < fps; frame++) {
    updateArcadeVehicle(
      world,
      physicsWorld,
      physicsSystem,
      tracked,
      inputs,
      1 / fps,
    )
  }
  return state.currentSpeed
}

describe('updateCustomSpring', () => {
  it('is a no-op when the target entity is missing', () => {
    const simulation = createSpringSimulation('missing-target')

    updateCustomSpring(simulation.world, simulation.physicsWorld, simulation.physicsSystem)
    simulation.physicsSystem.update(simulation.world, 1 / 60)

    expect(simulation.physicsSystem.getBodyTransform(simulation.springId)?.position[0]).toBe(0)
  })

  it('applies spring force in the stub backend', () => {
    const result = simulateSpring([1 / 60])

    expect(result.springX).toBeGreaterThan(0)
    expect(result.targetX).toBeLessThan(2)
  })

  it('stays bounded and equivalent across render-frame substep arrangements', () => {
    const sixtyHz = simulateSpring(Array.from({ length: 60 }, () => 1 / 60))
    const thirtyHz = simulateSpring(Array.from({ length: 30 }, () => 1 / 30))

    expect(thirtyHz.springX).toBeCloseTo(sixtyHz.springX, 8)
    expect(thirtyHz.targetX).toBeCloseTo(sixtyHz.targetX, 8)
    expect(Math.abs(thirtyHz.springX)).toBeLessThan(3)
    expect(Math.abs(thirtyHz.targetX)).toBeLessThan(3)
  })
})

describe('updateArcadeVehicle', () => {
  it('produces equivalent one-second speed smoothing at 30/60/120 FPS', () => {
    const thirtyHz = simulateArcadeSpeed(30)
    const sixtyHz = simulateArcadeSpeed(60)
    const oneTwentyHz = simulateArcadeSpeed(120)
    const legacySixtyHz = 8 * (1 - Math.pow(1 - 0.03, 60))

    expect(sixtyHz).toBeCloseTo(legacySixtyHz, 10)
    expect(thirtyHz).toBeCloseTo(sixtyHz, 10)
    expect(oneTwentyHz).toBeCloseTo(sixtyHz, 10)
  })
})
