import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PHYSICS_CATCH_UP_POLICY } from '@haku/engine'
import { startPlayModePhysics } from './play-mode-physics.js'

const { backend, colliderSystem, vehicleSession, createBackend, startVehiclePlayMode } = vi.hoisted(
  () => {
    const backend = { kind: 'backend' }
    const colliderSystem = { dispose: vi.fn() }
    const vehicleSession = { dispose: vi.fn() }
    return {
      backend,
      colliderSystem,
      vehicleSession,
      createBackend: vi.fn(async () => backend),
      startVehiclePlayMode: vi.fn(() => vehicleSession),
    }
  },
)

vi.mock('@haku/engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('@haku/engine')>()
  return {
    ...original,
    PhysicsColliderSystem: vi.fn(() => colliderSystem),
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

    session.dispose()
    expect(vehicleSession.dispose).toHaveBeenCalledOnce()
    expect(colliderSystem.dispose).toHaveBeenCalledOnce()
  })
})
