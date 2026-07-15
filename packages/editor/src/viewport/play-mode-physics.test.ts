import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PHYSICS_CATCH_UP_POLICY } from '@haku/engine'
import { startPlayModePhysics } from './play-mode-physics.js'

const { backend, colliderSystem, contactSystem, querySystem, jointSystem, areaGravitySystem, vehicleSession, createBackend, startVehiclePlayMode } =
  vi.hoisted(() => {
    const backend = { kind: 'backend' }
    const colliderSystem = { dispose: vi.fn() }
    const contactSystem = {
      takeCollisionEvents: vi.fn(() => []),
      peekCollisionEvents: vi.fn(() => []),
    }
    const querySystem = { raycast: vi.fn(() => null) }
    const jointSystem = {}
    const areaGravitySystem = {}
    const vehicleSession = { dispose: vi.fn() }
    return {
      backend,
      colliderSystem,
      contactSystem,
      querySystem,
      jointSystem,
      areaGravitySystem,
      vehicleSession,
      createBackend: vi.fn(async () => backend),
      startVehiclePlayMode: vi.fn(() => vehicleSession),
    }
  })

vi.mock('@haku/engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('@haku/engine')>()
  return {
    ...original,
    PhysicsColliderSystem: vi.fn(() => colliderSystem),
    PhysicsContactSystem: vi.fn(() => contactSystem),
    PhysicsQuerySystem: vi.fn(() => querySystem),
    PhysicsJointSystem: vi.fn(() => jointSystem),
    PhysicsAreaGravitySystem: vi.fn(() => areaGravitySystem),
    startVehiclePlayMode,
  }
})

vi.mock('@haku/physics-rapier', () => ({
  createRapierPhysicsBackend: createBackend,
}))

describe('startPlayModePhysics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the shared bounded catch-up policy', async () => {
    const physicsSystem = { kind: 'physics-system' }
    const engine = {
      setPhysicsBackend: vi.fn(() => physicsSystem),
      addSystem: vi.fn(),
      removeSystem: vi.fn(),
      clearPhysicsBackend: vi.fn(),
    }

    const session = await startPlayModePhysics(engine as never, {} as never)

    expect(engine.setPhysicsBackend).toHaveBeenCalledWith(backend, PHYSICS_CATCH_UP_POLICY)
    expect(startVehiclePlayMode).toHaveBeenCalledWith(engine, physicsSystem, {
      input: undefined,
    })

    expect(session.contactSystem).toBe(contactSystem)
    expect(session.querySystem).toBe(querySystem)
    expect(session.takeCollisionEvents()).toEqual([])
    session.dispose()
    expect(vehicleSession.dispose).toHaveBeenCalledOnce()
    expect(contactSystem.takeCollisionEvents).toHaveBeenCalledTimes(2)
    expect(engine.removeSystem).toHaveBeenCalledTimes(5)
    expect(colliderSystem.dispose).toHaveBeenCalledOnce()
  })
})
