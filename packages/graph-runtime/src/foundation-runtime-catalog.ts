import {
  NodeRuntimeRegistry,
  type ResourceSnapshotProvider,
} from './runtime-adapter.js'
import {
  registerCrossServiceRuntimeAdapters,
  type CrossServiceRuntimeServices,
} from './cross-service-runtime.js'
import {
  registerDeterministicRuntimeAdapters,
  type DeterministicRuntimeServices,
  type SeededRandomCheckpoint,
} from './deterministic-runtime.js'
import { registerFoundationRuntimeAdapters } from './foundation-runtime.js'
import {
  registerWorldRuntimeAdapters,
  type WorldGraphService,
} from './world-runtime.js'

export type RuntimeAdapterRegistrar = (registry: NodeRuntimeRegistry) => void

export interface FoundationRuntimeServices {
  readonly deterministic: DeterministicRuntimeServices
  readonly world: WorldGraphService
  readonly services: CrossServiceRuntimeServices
}

/**
 * Composes graph-runtime-owned adapters while leaving subsystem adapters at
 * the caller's composition root.
 */
export function createFoundationRuntimeRegistry(
  services: FoundationRuntimeServices,
  subsystemRegistrars: readonly RuntimeAdapterRegistrar[] = [],
): NodeRuntimeRegistry {
  const registry = new NodeRuntimeRegistry()
  registerFoundationRuntimeAdapters(registry)
  registerDeterministicRuntimeAdapters(registry, services.deterministic)
  registerWorldRuntimeAdapters(registry, services.world)
  registerCrossServiceRuntimeAdapters(registry, services.services)
  for (const register of subsystemRegistrars) register(registry)
  return registry
}

export function createDeterministicResourceSnapshotProvider(
  services: DeterministicRuntimeServices,
): ResourceSnapshotProvider {
  return {
    snapshot(resource) {
      if (resource === 'graph.variable') return services.variables.capture()
      if (resource === 'random.seeded') return services.random.capture()
      throw new Error(`Unknown deterministic checkpoint resource: ${resource}`)
    },
    restore(resource, value) {
      if (resource === 'graph.variable') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new TypeError('Graph variable checkpoint must be an object')
        }
        services.variables.restore(value as Readonly<Record<string, unknown>>)
        return
      }
      if (resource === 'random.seeded') {
        services.random.restore(value as SeededRandomCheckpoint)
        return
      }
      throw new Error(`Unknown deterministic checkpoint resource: ${resource}`)
    },
  }
}
