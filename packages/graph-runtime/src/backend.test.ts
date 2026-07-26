import { describe, expect, it } from 'vitest'
import { EngineScheduler } from '@haku/core'
import {
  namedType,
  NUMBER_TYPE,
  type GraphExecutionPlan,
} from '@haku/graph'
import {
  GraphInstance,
  InterpreterExecutionBackend,
  NodeRuntimeRegistry,
  type ExecutionBackend,
} from './index.js'

const uid = (value: number): string =>
  `45500000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const OUTPUT = uid(1)
const NODE = uid(101)
const NODE_TYPE = uid(501)

const PLAN: GraphExecutionPlan = {
  schemaVersion: 1,
  graphId: uid(900),
  registryFingerprint: 'backend-registry',
  planFingerprint: 'backend-plan',
  nodes: [
    {
      id: NODE,
      nodeType: NODE_TYPE,
      version: '1',
      kind: 'builtin',
      domain: 'FrameGameplay',
      order: 0,
      typeArguments: {},
      properties: {},
      reads: [],
      writes: [],
      effects: [],
      execution: 'sync',
      exportedState: [],
      checkpoint: { eligible: true, causalChain: [] },
    },
  ],
  connections: [],
  publicInterface: {
    ports: [
      {
        id: OUTPUT,
        name: 'Value',
        kind: 'data',
        direction: 'output',
        type: namedType(NUMBER_TYPE),
      },
    ],
  },
  subgraphs: [],
  checkpointEligible: true,
}

describe('replaceable execution backend', () => {
  it('dispatches registered headless node adapters by type and version', () => {
    const registry = new NodeRuntimeRegistry()
    registry.register({
      nodeType: NODE_TYPE,
      version: '1',
      execute: () => ({ publicOutputs: { [OUTPUT]: 1 } }),
    })
    const instance = new GraphInstance({
      id: uid(901),
      plan: PLAN,
      registryFingerprint: PLAN.registryFingerprint,
      scheduler: new EngineScheduler(),
      backend: new InterpreterExecutionBackend(registry),
    })

    instance.start(NODE)

    expect(instance.getOutput(OUTPUT)).toBe(1)
    expect(() =>
      registry.register({
        nodeType: NODE_TYPE,
        version: '1',
        execute: () => ({}),
      }),
    ).toThrow('Duplicate runtime adapter')
  })

  it('can replace the interpreter without changing the plan or instance API', () => {
    const replacement: ExecutionBackend = {
      execute: () => ({ publicOutputs: { [OUTPUT]: 2 } }),
    }
    const instance = new GraphInstance({
      id: uid(901),
      plan: PLAN,
      registryFingerprint: PLAN.registryFingerprint,
      scheduler: new EngineScheduler(),
      backend: replacement,
    })

    instance.start(NODE)

    expect(instance.getOutput(OUTPUT)).toBe(2)
  })

  it('rejects incompatible registry and expected plan fingerprints before start', () => {
    expect(
      () =>
        new GraphInstance({
          id: uid(901),
          plan: PLAN,
          registryFingerprint: 'different',
          scheduler: new EngineScheduler(),
          backend: { execute: () => ({}) },
        }),
    ).toThrow('incompatible with the runtime registry')
    expect(
      () =>
        new GraphInstance({
          id: uid(901),
          plan: PLAN,
          registryFingerprint: PLAN.registryFingerprint,
          expectedPlanFingerprint: 'different',
          scheduler: new EngineScheduler(),
          backend: { execute: () => ({}) },
        }),
    ).toThrow('unexpected fingerprint')
  })
})
