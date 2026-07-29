import {
  registerDeterministicNodeContracts,
} from './deterministic-node-contracts.js'
import { registerFoundationNodeContracts } from './foundation-node-contracts.js'
import { NodeRegistry } from './node-registry.js'
import { registerServiceNodeContracts } from './service-node-contracts.js'
import { registerWorldNodeContracts } from './world-node-contracts.js'

export type NodeContractRegistrar = (registry: NodeRegistry) => void

/**
 * Creates the metadata-only foundation catalog.
 *
 * Subsystems contribute their own registrars at the composition root so
 * @haku/graph never imports runtime or platform packages.
 */
export function createFoundationNodeRegistry(
  subsystemRegistrars: readonly NodeContractRegistrar[] = [],
): NodeRegistry {
  const registry = new NodeRegistry()
  for (const register of [
    registerFoundationNodeContracts,
    registerDeterministicNodeContracts,
    registerWorldNodeContracts,
    registerServiceNodeContracts,
    ...subsystemRegistrars,
  ]) {
    register(registry)
  }
  return registry
}
