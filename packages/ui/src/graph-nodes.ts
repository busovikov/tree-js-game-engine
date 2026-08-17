import {
  BOOL_TYPE,
  STRING_TYPE,
  defineNode,
  namedType,
  type NodePortInput,
  type NodeRegistry,
} from '@haku/graph'
import {
  type CheckpointEffectRecord,
  type NodeExecutionRequest,
  type NodeExecutionResult,
  type NodeRuntimeRegistry,
} from '@haku/graph-runtime'
import { AssetIdSchema } from '@haku/schema'
import { z } from 'zod'
import { UIElementIdSchema, UIThemeIdSchema } from './schema.js'
import type { UIService } from './ui-service.js'

const id = (value: number): string =>
  `a4000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const UI_GRAPH_CONTRACTS = {
  setText: {
    nodeType: id(1),
    ports: { flowIn: id(101), flowOut: id(102), value: id(103) },
  },
  setVisible: {
    nodeType: id(2),
    ports: { flowIn: id(201), flowOut: id(202), value: id(203) },
  },
  setEnabled: {
    nodeType: id(3),
    ports: { flowIn: id(301), flowOut: id(302), value: id(303) },
  },
  setTheme: {
    nodeType: id(4),
    ports: { flowIn: id(401), flowOut: id(402) },
  },
} as const

const UIElementProperties = z
  .object({
    documentId: AssetIdSchema,
    elementId: UIElementIdSchema,
  })
  .strict()

const UIThemeProperties = z
  .object({
    documentId: AssetIdSchema,
    themeId: UIThemeIdSchema,
  })
  .strict()

function flowPorts(ports: { readonly flowIn: string; readonly flowOut: string }) {
  return [
    { id: ports.flowIn, name: 'In', kind: 'flow' as const, direction: 'input' as const },
    { id: ports.flowOut, name: 'Out', kind: 'flow' as const, direction: 'output' as const },
  ]
}

function mutationContract(input: {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly ports: readonly NodePortInput[]
  readonly propertySchema: z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>
  readonly propertyContract: Record<string, unknown>
}) {
  return defineNode({
    id: input.id,
    version: '1',
    name: input.name,
    category: 'UI',
    description: input.description,
    kind: 'builtin',
    typeParameters: [],
    ports: input.ports,
    propertySchema: input.propertySchema,
    propertyContract: input.propertyContract,
    domains: ['FrameGameplay', 'LateUpdate', 'Presentation'],
    capabilities: ['ui'],
    reads: [],
    writes: [{ resource: 'ui', scope: 'static' }],
    effects: ['ui'],
    execution: 'sync',
    checkpoint: 'safe',
    checkpointScope: 'bounded',
    asyncCheckpointPolicies: [],
    resultPersistence: 'none',
    liveness: 'on-flow',
    exportedState: [],
  })
}

export function registerUINodeContracts(registry: NodeRegistry): void {
  for (const definition of [
    {
      contract: UI_GRAPH_CONTRACTS.setText,
      name: 'Set UI Text',
      description: 'Change text on one UUID-addressed UI element.',
      type: STRING_TYPE,
    },
    {
      contract: UI_GRAPH_CONTRACTS.setVisible,
      name: 'Set UI Visibility',
      description: 'Show or hide one UUID-addressed UI element.',
      type: BOOL_TYPE,
    },
    {
      contract: UI_GRAPH_CONTRACTS.setEnabled,
      name: 'Set UI Enabled',
      description: 'Enable or disable interaction on one UUID-addressed UI element.',
      type: BOOL_TYPE,
    },
  ] as const) {
    registry.register(
      mutationContract({
        id: definition.contract.nodeType,
        name: definition.name,
        description: definition.description,
        ports: [
          ...flowPorts(definition.contract.ports),
          {
            id: definition.contract.ports.value,
            name: 'Value',
            kind: 'data',
            direction: 'input',
            type: namedType(definition.type),
          },
        ],
        propertySchema: UIElementProperties,
        propertyContract: { documentId: 'asset UUID', elementId: 'UI element UUID' },
      }),
    )
  }

  registry.register(
    mutationContract({
      id: UI_GRAPH_CONTRACTS.setTheme.nodeType,
      name: 'Set UI Theme',
      description: 'Apply one authored theme to a mounted UI document.',
      ports: flowPorts(UI_GRAPH_CONTRACTS.setTheme.ports),
      propertySchema: UIThemeProperties,
      propertyContract: { documentId: 'asset UUID', themeId: 'UI theme UUID' },
    }),
  )
}

export function registerUIRuntimeAdapters(
  registry: NodeRuntimeRegistry,
  service: UIService,
): void {
  const register = (
    nodeType: string,
    execute: (request: NodeExecutionRequest) => NodeExecutionResult,
  ): void => registry.register({ nodeType, version: '1', execute })

  register(UI_GRAPH_CONTRACTS.setText.nodeType, (request) => {
    const properties = UIElementProperties.parse(request.node.properties)
    const target = { document: properties.documentId, element: properties.elementId }
    const value = z.string().parse(request.readData(UI_GRAPH_CONTRACTS.setText.ports.value))
    service.setText(target, value)
    return mutationResult(request, 'ui.set-text', target, UI_GRAPH_CONTRACTS.setText.ports.flowOut)
  })

  register(UI_GRAPH_CONTRACTS.setVisible.nodeType, (request) => {
    const properties = UIElementProperties.parse(request.node.properties)
    const target = { document: properties.documentId, element: properties.elementId }
    const value = z.boolean().parse(
      request.readData(UI_GRAPH_CONTRACTS.setVisible.ports.value),
    )
    service.setVisible(target, value)
    return mutationResult(
      request,
      'ui.set-visible',
      { ...target, value },
      UI_GRAPH_CONTRACTS.setVisible.ports.flowOut,
    )
  })

  register(UI_GRAPH_CONTRACTS.setEnabled.nodeType, (request) => {
    const properties = UIElementProperties.parse(request.node.properties)
    const target = { document: properties.documentId, element: properties.elementId }
    const value = z.boolean().parse(
      request.readData(UI_GRAPH_CONTRACTS.setEnabled.ports.value),
    )
    service.setEnabled(target, value)
    return mutationResult(
      request,
      'ui.set-enabled',
      { ...target, value },
      UI_GRAPH_CONTRACTS.setEnabled.ports.flowOut,
    )
  })

  register(UI_GRAPH_CONTRACTS.setTheme.nodeType, (request) => {
    const properties = UIThemeProperties.parse(request.node.properties)
    service.setTheme(properties.documentId, properties.themeId)
    return mutationResult(
      request,
      'ui.set-theme',
      properties,
      UI_GRAPH_CONTRACTS.setTheme.ports.flowOut,
    )
  })
}

function mutationResult(
  request: NodeExecutionRequest,
  kind: string,
  payload: unknown,
  flowOut: string,
): NodeExecutionResult {
  return {
    flow: [flowOut],
    effects: [effect(request, kind, payload)],
  }
}

function effect(
  request: NodeExecutionRequest,
  kind: string,
  payload: unknown,
): CheckpointEffectRecord {
  return {
    id: [
      request.instanceId,
      request.node.id,
      kind,
      request.tickNumber,
      request.frameNumber,
      JSON.stringify(payload),
    ].join(':'),
    kind,
    payload,
  }
}
