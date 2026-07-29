import {
  PLATFORM_GRAPH_CAPABILITIES,
  SERVICE_GRAPH_CONTRACTS,
  type PlatformGraphCapability,
} from '@haku/graph'
import {
  type CheckpointEffectRecord,
  type NodeExecutionRequest,
  type NodeExecutionResult,
  type NodeRuntimeRegistry,
} from './runtime-adapter.js'

export interface SaveGraphService {
  load(key: string): Promise<unknown>
  save(key: string, value: unknown): Promise<void>
}

export interface PlatformGraphService {
  hasCapability(capability: PlatformGraphCapability): Promise<boolean>
}

export interface DebugGraphService {
  log(message: string): void
}

export interface CrossServiceRuntimeServices {
  readonly save: SaveGraphService
  readonly platform: PlatformGraphService
  readonly debug: DebugGraphService
}

export class GraphAssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphAssertionError'
  }
}

export function registerCrossServiceRuntimeAdapters(
  registry: NodeRuntimeRegistry,
  services: CrossServiceRuntimeServices,
): void {
  const register = (
    nodeType: string,
    execute: (
      request: NodeExecutionRequest,
    ) => NodeExecutionResult | Promise<NodeExecutionResult>,
  ): void => registry.register({ nodeType, version: '1', execute })

  const loadValue = SERVICE_GRAPH_CONTRACTS.loadValue
  register(loadValue.nodeType, async (request) => {
    const value = await services.save.load(keyProperty(request))
    return {
      flow: [loadValue.ports.flowOut],
      data: {
        [loadValue.ports.value]:
          value === undefined
            ? { kind: 'none' }
            : { kind: 'some', value: structuredClone(value) },
      },
    }
  })

  const saveValue = SERVICE_GRAPH_CONTRACTS.saveValue
  register(saveValue.nodeType, async (request) => {
    const key = keyProperty(request)
    const value = structuredClone(request.readData(saveValue.ports.value))
    await services.save.save(key, value)
    return {
      flow: [saveValue.ports.flowOut],
      effects: [effect(request, 'storage.write', { key })],
    }
  })

  const capability = SERVICE_GRAPH_CONTRACTS.hasPlatformCapability
  register(capability.nodeType, async (request) => ({
    data: {
      [capability.ports.available]: await services.platform.hasCapability(
        capabilityProperty(request),
      ),
    },
  }))

  const debugLog = SERVICE_GRAPH_CONTRACTS.debugLog
  register(debugLog.nodeType, (request) => {
    const message = stringInput(request, debugLog.ports.message, 'Debug message')
    services.debug.log(message)
    return {
      flow: [debugLog.ports.flowOut],
      effects: [effect(request, 'debug.log', { message })],
    }
  })

  const assertion = SERVICE_GRAPH_CONTRACTS.assert
  register(assertion.nodeType, (request) => {
    const condition = request.readData(assertion.ports.condition)
    if (typeof condition !== 'boolean') {
      throw new TypeError('Assertion condition must be boolean')
    }
    const message = stringInput(
      request,
      assertion.ports.message,
      'Assertion message',
    )
    if (!condition) {
      throw new GraphAssertionError(message)
    }
    return { flow: [assertion.ports.flowOut] }
  })
}

function keyProperty(request: NodeExecutionRequest): string {
  const key = request.node.properties.key
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Save key must be a non-empty string')
  }
  return key
}

function capabilityProperty(
  request: NodeExecutionRequest,
): PlatformGraphCapability {
  const capability = request.node.properties.capability
  if (
    typeof capability !== 'string' ||
    !PLATFORM_GRAPH_CAPABILITIES.includes(
      capability as PlatformGraphCapability,
    )
  ) {
    throw new TypeError('Unknown platform capability')
  }
  return capability as PlatformGraphCapability
}

function stringInput(
  request: NodeExecutionRequest,
  portId: string,
  label: string,
): string {
  const value = request.readData(portId)
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`)
  }
  return value
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
