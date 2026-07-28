import {
  entityId,
  type ComponentDefinition,
  type IWorld,
} from '@haku/core'
import type { CustomComponentGraphContract } from '@haku/graph'
import type {
  NodeExecutionRequest,
  NodeExecutionResult,
  NodeRuntimeRegistry,
} from './index.js'

export interface CustomComponentRuntimeOptions {
  readonly world: IWorld
  readonly resolveComponent: (
    typeId: string,
  ) => ComponentDefinition | undefined
}

function entityFromReference(value: unknown): ReturnType<typeof entityId> {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('$ref' in value) ||
    typeof value.$ref !== 'string' ||
    !value.$ref.startsWith('entity:')
  ) {
    throw new Error('Custom component nodes require an EntityRef input')
  }
  return entityId(value.$ref.slice('entity:'.length))
}

function portId(
  node: CustomComponentGraphContract['nodes'][keyof CustomComponentGraphContract['nodes']],
  name: string,
): string {
  const port = node.ports[name]
  if (!port) throw new Error(`Custom component node is missing ${name} port`)
  return port.id
}

export function registerCustomComponentRuntimeAdapters(
  contracts: readonly CustomComponentGraphContract[],
  registry: NodeRuntimeRegistry,
  options: CustomComponentRuntimeOptions,
): void {
  for (const contract of contracts) {
    const component = options.resolveComponent(contract.componentType)
    if (!component) {
      throw new Error(
        `Unknown custom component graph type: ${contract.componentType}`,
      )
    }
    const readNode = contract.nodes.read
    registry.register({
      nodeType: readNode.id,
      version: contract.version,
      execute(request): NodeExecutionResult {
        const entity = entityFromReference(
          request.readData(portId(readNode, 'entity')),
        )
        const value = options.world.getComponent(entity, component)
        if (value === undefined) {
          throw new Error(
            `Entity ${entity.value} does not have component ${component.id}`,
          )
        }
        return {
          data: {
            [portId(readNode, 'value')]: value,
          },
        }
      },
    })

    const registerCommand = (
      kind: 'add' | 'set' | 'remove',
      node: CustomComponentGraphContract['nodes'][keyof CustomComponentGraphContract['nodes']],
    ): void => {
      registry.register({
        nodeType: node.id,
        version: contract.version,
        execute(request: NodeExecutionRequest): NodeExecutionResult {
          const entity = entityFromReference(
            request.readData(portId(node, 'entity')),
          )
          if (kind === 'remove') {
            options.world.removeComponent(entity, component)
          } else {
            const data = component.schema.parse(
              request.readData(portId(node, 'value')),
            )
            const exists = options.world.hasComponent(entity, component)
            if (kind === 'add' && exists) {
              throw new Error(
                `Cannot add existing component ${component.id} to ${entity.value}`,
              )
            }
            if (kind === 'set' && !exists) {
              throw new Error(
                `Cannot set missing component ${component.id} on ${entity.value}`,
              )
            }
            options.world.addComponent(entity, component, data)
          }
          return { flow: [portId(node, 'flowOut')] }
        },
      })
    }

    registerCommand('set', contract.nodes.set)
    registerCommand('add', contract.nodes.add)
    registerCommand('remove', contract.nodes.remove)
  }
}
