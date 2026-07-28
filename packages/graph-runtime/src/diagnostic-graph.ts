import { EngineScheduler, TagComponent, type IWorld } from '@haku/core'
import {
  DIAGNOSTIC_GRAPH_IDS,
  type GraphExecutionPlan,
} from '@haku/graph'
import {
  GraphInstance,
  InterpreterExecutionBackend,
  NodeRuntimeRegistry,
  type ExecutionTraceEntry,
} from './index.js'

export interface DiagnosticGraphRun {
  readonly planFingerprint: string
  readonly trace: readonly ExecutionTraceEntry[]
  readonly portValues: Readonly<Record<string, unknown>>
}

export function runDiagnosticGraphPlan(
  plan: GraphExecutionPlan,
  world: IWorld,
): DiagnosticGraphRun {
  if (plan.graphId !== DIAGNOSTIC_GRAPH_IDS.graph) {
    throw new Error(`Expected M07 diagnostic graph, received ${plan.graphId}`)
  }
  const runtimes = new NodeRuntimeRegistry()
  runtimes.register({
    nodeType: DIAGNOSTIC_GRAPH_IDS.nodeTypes.start,
    version: '1',
    execute(request) {
      return {
        flow: [
          request.node.id === DIAGNOSTIC_GRAPH_IDS.nodes.asyncStart
            ? DIAGNOSTIC_GRAPH_IDS.callsites.asyncStartOut
            : DIAGNOSTIC_GRAPH_IDS.callsites.mainStartOut,
        ],
      }
    },
  })
  runtimes.register({
    nodeType: DIAGNOSTIC_GRAPH_IDS.nodeTypes.dynamicRead,
    version: '1',
    execute() {
      return { flow: [DIAGNOSTIC_GRAPH_IDS.callsites.dynamicOut] }
    },
  })
  runtimes.register({
    nodeType: DIAGNOSTIC_GRAPH_IDS.nodeTypes.checkpoint,
    version: '1',
    execute() {
      return { flow: [DIAGNOSTIC_GRAPH_IDS.callsites.checkpointOut] }
    },
  })
  runtimes.register({
    nodeType: DIAGNOSTIC_GRAPH_IDS.nodeTypes.markWorld,
    version: '1',
    execute(request) {
      const entity = world.createEntity('M07 Graph Diagnostic')
      world.addComponent(entity, TagComponent, {
        tags: [String(request.node.properties.tag)],
      })
      return {}
    },
  })
  runtimes.register({
    nodeType: DIAGNOSTIC_GRAPH_IDS.nodeTypes.async,
    version: '1',
    async execute() {
      return { flow: [DIAGNOSTIC_GRAPH_IDS.callsites.asyncOut] }
    },
  })

  const instance = new GraphInstance({
    id: '73000000-0000-4000-8000-000000000900',
    plan,
    registryFingerprint: plan.registryFingerprint,
    scheduler: new EngineScheduler(),
    backend: new InterpreterExecutionBackend(runtimes),
  })
  const execution = instance.start(DIAGNOSTIC_GRAPH_IDS.nodes.mainStart)
  if (execution instanceof Promise) {
    throw new Error('The M07 main diagnostic path must remain synchronous')
  }
  return {
    planFingerprint: plan.planFingerprint,
    trace: instance.trace,
    portValues: {
      [DIAGNOSTIC_GRAPH_IDS.callsites.mainStartOut]: 'flow',
      [DIAGNOSTIC_GRAPH_IDS.callsites.dynamicOut]: 'dynamic-body-read',
      [DIAGNOSTIC_GRAPH_IDS.callsites.checkpointOut]: 'checkpoint-bypassed',
    },
  }
}
