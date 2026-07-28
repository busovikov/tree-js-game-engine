import { z } from 'zod'
import type { ComponentDefinition } from '@haku/core'
import { ENTITY_REF_TYPE, type DataTypeDefinition, type TypeRegistry } from './type-registry.js'
import { namedType, type TypeExpression } from './graph-schema.js'
import {
  defineNode,
  type NodeDefinition,
  type NodeRegistry,
} from './node-registry.js'

export interface CustomComponentGraphNode {
  readonly id: string
  readonly ports: Readonly<
    Record<
      string,
      {
        readonly id: string
        readonly type?: TypeExpression
      }
    >
  >
}

export interface CustomComponentGraphContract {
  readonly componentType: string
  readonly dataType: string
  readonly version: string
  readonly nodes: {
    readonly read: CustomComponentGraphNode
    readonly set: CustomComponentGraphNode
    readonly add: CustomComponentGraphNode
    readonly remove: CustomComponentGraphNode
  }
}

function fnv32(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function derivedUuid(seed: string): string {
  const hex = `${fnv32(`${seed}:0`)}${fnv32(`${seed}:1`)}${fnv32(`${seed}:2`)}${fnv32(`${seed}:3`)}`
    .split('')
  hex[12] = '4'
  hex[16] = '8'
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`
}

function componentDataType(
  component: ComponentDefinition,
): DataTypeDefinition {
  return {
    contract: {
      id: component.id,
      name: `${component.name}Data`,
      version: String(component.version ?? 1),
      typeParameters: [],
      shape: {
        kind: 'component',
        fields:
          component.inspector?.fields.map((field) => ({
            name: field.name,
            type: field.type,
            optional: field.optional,
          })) ?? [],
      },
      serializable: true,
      checkpointSafe: true,
    },
    runtimeSchema: component.schema,
    createRuntimeSchema(arguments_) {
      if (arguments_.length > 0) {
        throw new Error(`${component.name}Data expects 0 type arguments`)
      }
      return component.schema
    },
  }
}

function nodeBase(
  component: ComponentDefinition,
  action: string,
  input: Omit<
    Parameters<typeof defineNode>[0],
    | 'id'
    | 'version'
    | 'name'
    | 'category'
    | 'description'
    | 'kind'
    | 'typeParameters'
    | 'propertySchema'
    | 'propertyContract'
  >,
): NodeDefinition {
  return defineNode({
    id: derivedUuid(`${component.id}:node:${action}`),
    version: String(component.version ?? 1),
    name: `${action} ${component.name}`,
    category: `Components/${component.name}`,
    description: `${action} the ${component.name} component through the declared world capability.`,
    kind: 'builtin',
    typeParameters: [],
    propertySchema: z.object({}).strict(),
    propertyContract: {},
    ...input,
  })
}

function port(
  component: ComponentDefinition,
  action: string,
  name: string,
  type?: TypeExpression,
): { readonly id: string; readonly type?: TypeExpression } {
  return {
    id: derivedUuid(`${component.id}:node:${action}:port:${name}`),
    ...(type === undefined ? {} : { type }),
  }
}

function defineContracts(
  component: ComponentDefinition,
): {
  readonly contract: CustomComponentGraphContract
  readonly definitions: readonly NodeDefinition[]
} {
  const entityType = namedType(ENTITY_REF_TYPE)
  const valueType = namedType(component.id)
  const resource = {
    resource: `component:${component.id}`,
    scope: 'dynamic' as const,
  }
  const common = {
    domains: ['FixedGameplay', 'FrameGameplay'] as const,
    execution: 'sync' as const,
    checkpoint: 'conditional' as const,
    checkpointScope: 'bounded' as const,
    resultPersistence: 'none' as const,
    exportedState: [],
  }

  const readPorts = {
    entity: port(component, 'Get', 'entity', entityType),
    value: port(component, 'Get', 'value', valueType),
  }
  const read = nodeBase(component, 'Get', {
    ...common,
    ports: [
      {
        ...readPorts.entity,
        name: 'Entity',
        kind: 'data',
        direction: 'input',
      },
      {
        ...readPorts.value,
        name: 'Value',
        kind: 'data',
        direction: 'output',
      },
    ],
    capabilities: ['world.read'],
    reads: [resource],
    writes: [],
    effects: ['world.read'],
    liveness: 'pure',
  })

  const command = (
    action: 'Set' | 'Add' | 'Remove',
  ): {
    readonly node: NodeDefinition
    readonly ports: CustomComponentGraphNode['ports']
  } => {
    const valuePort =
      action === 'Remove'
        ? undefined
        : port(component, action, 'value', valueType)
    const ports = {
      flowIn: port(component, action, 'flow-in'),
      flowOut: port(component, action, 'flow-out'),
      entity: port(component, action, 'entity', entityType),
      ...(valuePort === undefined ? {} : { value: valuePort }),
    }
    return {
      node: nodeBase(component, action, {
        ...common,
        ports: [
          {
            ...ports.flowIn,
            name: 'In',
            kind: 'flow',
            direction: 'input',
          },
          {
            ...ports.flowOut,
            name: 'Out',
            kind: 'flow',
            direction: 'output',
          },
          {
            ...ports.entity,
            name: 'Entity',
            kind: 'data',
            direction: 'input',
          },
          ...(valuePort !== undefined
            ? [
                {
                  ...valuePort,
                  name: 'Value',
                  kind: 'data' as const,
                  direction: 'input' as const,
                },
              ]
            : []),
        ],
        capabilities: ['world.write'],
        reads: [resource],
        writes: [resource],
        effects: ['world.write'],
        liveness: 'on-flow',
      }),
      ports,
    }
  }
  const set = command('Set')
  const add = command('Add')
  const remove = command('Remove')
  return {
    contract: {
      componentType: component.id,
      dataType: component.id,
      version: String(component.version ?? 1),
      nodes: {
        read: { id: read.contract.id, ports: readPorts },
        set: { id: set.node.contract.id, ports: set.ports },
        add: { id: add.node.contract.id, ports: add.ports },
        remove: { id: remove.node.contract.id, ports: remove.ports },
      },
    },
    definitions: [read, set.node, add.node, remove.node],
  }
}

export function registerCustomComponentGraphContracts(
  components: readonly ComponentDefinition[],
  types: TypeRegistry,
  nodes: NodeRegistry,
): readonly CustomComponentGraphContract[] {
  return [...components]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((component) => {
      types.register(componentDataType(component))
      const result = defineContracts(component)
      for (const definition of result.definitions) nodes.register(definition)
      return result.contract
    })
}
