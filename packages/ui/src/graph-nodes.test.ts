/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  NodeRegistry,
  type ExecutionPlanNode,
} from '@haku/graph'
import {
  NodeRuntimeRegistry,
  type NodeExecutionRequest,
  type NodeExecutionResult,
} from '@haku/graph-runtime'
import { assetId } from '@haku/schema'
import {
  UIService,
  UI_GRAPH_CONTRACTS,
  UIDocumentSchema,
  createUISdk,
  registerUINodeContracts,
  registerUIRuntimeAdapters,
} from './index.js'

const DOCUMENT = '12000000-0000-4000-8000-000000000001'
const ROOT = '12000000-0000-4000-8000-000000000002'
const TEXT = '12000000-0000-4000-8000-000000000003'

function request(
  nodeType: string,
  properties: Readonly<Record<string, unknown>>,
  inputs: Readonly<Record<string, unknown>> = {},
): NodeExecutionRequest {
  const node: ExecutionPlanNode = {
    id: '12000000-0000-4000-8000-000000000010',
    nodeType,
    version: '1',
    kind: 'builtin',
    domain: 'FrameGameplay',
    order: 0,
    typeArguments: {},
    properties,
    reads: [],
    writes: [{ resource: 'ui', scope: 'static' }],
    effects: ['ui'],
    execution: 'sync',
    exportedState: [],
    checkpoint: { eligible: true, causalChain: [] },
  }
  return {
    instanceId: '12000000-0000-4000-8000-000000000011',
    graphId: '12000000-0000-4000-8000-000000000012',
    node,
    phase: 'FrameGameplay',
    tickNumber: 4,
    frameNumber: 5,
    snapshot: {
      id: 1,
      key: 'snapshot',
      phase: 'FrameGameplay',
      tickNumber: 4,
      frameNumber: 5,
      resourceVersions: {},
    },
    signal: new AbortController().signal,
    getParameter: () => undefined,
    readResource: () => undefined,
    readData: (portId) => inputs[portId],
    readNodeRef: () => undefined,
    runSubgraph: () => ({ instanceId: 'child', outputs: {} }),
    spawnChild: (task) => task(new AbortController().signal),
  }
}

function mountedService(): UIService {
  const service = new UIService()
  service.register(
    UIDocumentSchema.parse({
      schemaVersion: 1,
      id: DOCUMENT,
      name: 'Graph UI',
      root: ROOT,
      elements: [
        { id: ROOT, type: 'container', children: [TEXT] },
        { id: TEXT, type: 'text', text: 'Old' },
      ],
    }),
  )
  service.mount(assetId(DOCUMENT), document.createElement('div'))
  return service
}

describe('UI graph and SDK boundaries', () => {
  it('declares bounded UI-only mutation effects', () => {
    const registry = new NodeRegistry()
    registerUINodeContracts(registry)

    expect(registry.all()).toHaveLength(4)
    for (const definition of registry.all()) {
      expect(definition.contract).toMatchObject({
        capabilities: ['ui'],
        writes: [{ resource: 'ui', scope: 'static' }],
        effects: ['ui'],
        checkpoint: 'safe',
        checkpointScope: 'bounded',
      })
    }
  })

  it('changes text only through the injected public UI service', () => {
    const service = mountedService()
    const runtimes = new NodeRuntimeRegistry()
    registerUIRuntimeAdapters(runtimes, service)
    const contract = UI_GRAPH_CONTRACTS.setText

    const result = runtimes.require(contract.nodeType, '1').execute(
      request(
        contract.nodeType,
        { documentId: DOCUMENT, elementId: TEXT },
        { [contract.ports.value]: 'Graph value' },
      ),
    ) as NodeExecutionResult

    expect(service.require(assetId(DOCUMENT)).getElement(TEXT)?.textContent).toBe('Graph value')
    expect(result.effects).toMatchObject([{ kind: 'ui.set-text' }])
    expect(result.flow).toEqual([contract.ports.flowOut])
  })

  it('offers the same public mutation and event surface to the Custom Node SDK', () => {
    const service = mountedService()
    const sdk = createUISdk(service)

    sdk.setText({ document: assetId(DOCUMENT), element: TEXT }, 'SDK value')

    expect(service.require(assetId(DOCUMENT)).getElement(TEXT)?.textContent).toBe('SDK value')
    expect(sdk.onEvent).toBeTypeOf('function')
  })
})
