import {
  createBuiltinTypeRegistry,
  createDiagnosticGraphAsset,
  createDiagnosticNodeRegistry,
  registerCustomComponentGraphContracts,
  type CustomComponentGraphContract,
} from '@haku/graph'
import type { ComponentDefinition } from '@haku/core'
import { CommandBus } from '../commands/command-bus.js'
import { projectService } from '../services/project-service.js'
import { GraphAuthoringSession } from './graph-authoring-session.js'

export const graphCommandBus = new CommandBus()
export const graphNodeRegistry = createDiagnosticNodeRegistry()
export const graphTypeRegistry = createBuiltinTypeRegistry()

export function syncProjectComponentGraphContracts(
  components: readonly ComponentDefinition[] = projectService.getCustomComponentTypes(),
): readonly CustomComponentGraphContract[] {
  const pending = components.filter(
    (component) => graphTypeRegistry.get(component.id) === undefined,
  )
  return registerCustomComponentGraphContracts(pending, graphTypeRegistry, graphNodeRegistry)
}

export const graphAuthoringSession = new GraphAuthoringSession(
  graphCommandBus,
  {
    async readText(path) {
      return JSON.stringify(await projectService.loadGraphAsset(path))
    },
    async writeText(path, value) {
      await projectService.saveGraphAsset(path, JSON.parse(value))
    },
  },
  {
    nodes: graphNodeRegistry,
    types: graphTypeRegistry,
  },
)

graphAuthoringSession.openAsset('builtin:m07-diagnostic.graph.json', createDiagnosticGraphAsset())
