import { type ExecutionPlanNode } from '@haku/graph'
import {
  NodeRuntimeRegistry,
  type NodeExecutionRequest,
  type NodeExecutionResult,
} from '@haku/graph-runtime'
import {
  UIService,
  UI_GRAPH_CONTRACTS,
  UIDocumentSchema,
  registerUIRuntimeAdapters,
  type UIElementId,
} from '@haku/ui'

const DOCUMENT = '13000000-0000-4000-8000-000000000001'
const ROOT = '13000000-0000-4000-8000-000000000002'
const PANEL = '13000000-0000-4000-8000-000000000003'
const TITLE = '13000000-0000-4000-8000-000000000004'
const STATUS = '13000000-0000-4000-8000-000000000005'
const BUTTON = '13000000-0000-4000-8000-000000000006'
const HELP = '13000000-0000-4000-8000-000000000007'
const EVENT = '13000000-0000-4000-8000-000000000008'

const documentAsset = UIDocumentSchema.parse({
  schemaVersion: 2,
  id: DOCUMENT,
  name: 'M10b Runtime UI Diagnostic',
  root: ROOT,
  elements: [
    {
      id: ROOT,
      type: 'frame',
      children: [PANEL],
      layout: { mode: 'vertical' },
      sizing: {
        width: { mode: 'fixed', value: 600, unit: 'px' },
        height: { mode: 'fixed', value: 180, unit: 'px' },
      },
      accessibility: { role: 'region', label: 'M10b runtime UI diagnostic' },
    },
    {
      id: PANEL,
      type: 'frame',
      children: [TITLE, STATUS, BUTTON, HELP],
      layout: {
        mode: 'vertical',
        rowGap: 10,
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
      },
      style: {
        color: '#f5f7ff',
        backgroundColor: '#171a2b',
        fontFamily: 'system-ui, sans-serif',
        borderColor: '#6574ff',
        borderWidth: 1,
        borderRadius: 10,
      },
    },
    {
      id: TITLE,
      type: 'text',
      text: 'Production DOM UI',
      style: { color: '#aeb8ff', fontSize: 18, fontWeight: 'bold' },
    },
    {
      id: STATUS,
      type: 'text',
      text: 'Runtime UI ready',
      accessibility: { live: 'polite' },
      style: { fontSize: 15 },
    },
    {
      id: BUTTON,
      type: 'button',
      text: 'Advance UI boundary',
      events: { activate: EVENT },
      accessibility: { label: 'Run UI diagnostic' },
      style: {
        color: '#ffffff',
        backgroundColor: '#4355d9',
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
        borderColor: '#8290ff',
        borderWidth: 1,
        borderRadius: 6,
        cursor: 'pointer',
      },
    },
    {
      id: HELP,
      type: 'text',
      text: 'Click three times: native event → UIService → graph adapter.',
      style: { color: '#a8aec5', fontSize: 12 },
    },
  ],
  events: [{ id: EVENT, name: 'advance-ui-boundary', payload: 'none' }],
})

export interface UIDiagnostic {
  readonly service: UIService
  readonly instance: ReturnType<UIService['mount']>
  readonly rootId: UIElementId
  readonly statusId: UIElementId
  readonly buttonId: UIElementId
  readonly statusTarget: {
    readonly document: typeof documentAsset.id
    readonly element: UIElementId
  }
  readonly flowOut: string
  setTextFromGraph(text: string): NodeExecutionResult
  destroy(): void
}

export function createUIDiagnostic(host: HTMLElement): UIDiagnostic {
  const service = new UIService()
  service.register(documentAsset)
  const instance = service.mount(documentAsset.id, host)
  const statusId = STATUS as UIElementId
  const buttonId = BUTTON as UIElementId
  const rootId = ROOT as UIElementId
  const statusTarget = { document: documentAsset.id, element: statusId }
  const runtimes = new NodeRuntimeRegistry()
  registerUIRuntimeAdapters(runtimes, service)

  const setTextFromGraph = (text: string): NodeExecutionResult =>
    runtimes
      .require(UI_GRAPH_CONTRACTS.setText.nodeType, '1')
      .execute(createSetTextRequest(documentAsset.id, statusId, text)) as NodeExecutionResult

  let activationCount = 0
  const unsubscribe = service.subscribe((event) => {
    if (event.elementId !== buttonId || event.bindingId !== EVENT) return
    activationCount += 1
    if (activationCount === 1) {
      service.setText(statusTarget, 'Native button activated')
    } else if (activationCount === 2) {
      service.setText(statusTarget, 'UIService mutation')
    } else {
      setTextFromGraph('Graph adapter mutation')
      activationCount = 0
    }
  })

  return {
    service,
    instance,
    rootId,
    statusId,
    buttonId,
    statusTarget,
    flowOut: UI_GRAPH_CONTRACTS.setText.ports.flowOut,
    setTextFromGraph,
    destroy() {
      unsubscribe()
      service.destroyAll()
    },
  }
}

function createSetTextRequest(
  documentId: typeof documentAsset.id,
  elementId: UIElementId,
  text: string,
): NodeExecutionRequest {
  const contract = UI_GRAPH_CONTRACTS.setText
  const node: ExecutionPlanNode = {
    id: '13000000-0000-4000-8000-000000000009',
    nodeType: contract.nodeType,
    version: '1',
    kind: 'builtin',
    domain: 'FrameGameplay',
    order: 0,
    typeArguments: {},
    properties: { documentId, elementId },
    reads: [],
    writes: [{ resource: 'ui', scope: 'static' }],
    effects: ['ui'],
    execution: 'sync',
    exportedState: [],
    checkpoint: { eligible: true, causalChain: [] },
  }
  return {
    instanceId: '13000000-0000-4000-8000-000000000010',
    graphId: '13000000-0000-4000-8000-000000000011',
    node,
    phase: 'FrameGameplay',
    tickNumber: 0,
    frameNumber: 0,
    snapshot: {
      id: 0,
      key: 'm10b-ui-diagnostic',
      phase: 'FrameGameplay',
      tickNumber: 0,
      frameNumber: 0,
      resourceVersions: {},
    },
    signal: new AbortController().signal,
    getParameter: () => undefined,
    readResource: () => undefined,
    readData: (portId) => (portId === contract.ports.value ? text : undefined),
    readNodeRef: () => undefined,
    runSubgraph: () => ({ instanceId: 'unused', outputs: {} }),
    spawnChild: (task) => task(new AbortController().signal),
  }
}
