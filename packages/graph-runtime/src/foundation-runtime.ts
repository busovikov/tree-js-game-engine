import { FOUNDATION_GRAPH_IDS } from '@haku/graph'
import {
  type NodeExecutionRequest,
  type NodeExecutionResult,
  type NodeRuntimeRegistry,
} from './runtime-adapter.js'

type Vec3 = readonly [number, number, number]

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`)
  }
  return value
}

function vec3(value: unknown, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must be a three-component vector`)
  }
  return [
    finiteNumber(value[0], `${label}[0]`),
    finiteNumber(value[1], `${label}[1]`),
    finiteNumber(value[2], `${label}[2]`),
  ]
}

export function registerFoundationRuntimeAdapters(
  registry: NodeRuntimeRegistry,
): void {
  const register = (
    nodeType: string,
    execute: (request: NodeExecutionRequest) => NodeExecutionResult,
  ): void => registry.register({ nodeType, version: '1', execute })

  register(FOUNDATION_GRAPH_IDS.onStart.nodeType, () => ({
    flow: [FOUNDATION_GRAPH_IDS.onStart.ports.next],
  }))

  register(FOUNDATION_GRAPH_IDS.branch.nodeType, (request) => {
    const condition = request.readData(
      FOUNDATION_GRAPH_IDS.branch.ports.condition,
    )
    if (typeof condition !== 'boolean') {
      throw new TypeError('Branch condition must be boolean')
    }
    return {
      flow: [
        condition
          ? FOUNDATION_GRAPH_IDS.branch.ports.whenTrue
          : FOUNDATION_GRAPH_IDS.branch.ports.whenFalse,
      ],
    }
  })

  register(FOUNDATION_GRAPH_IDS.add.nodeType, (request) => ({
    data: {
      [FOUNDATION_GRAPH_IDS.add.ports.result]:
        finiteNumber(
          request.readData(FOUNDATION_GRAPH_IDS.add.ports.a),
          'Add A',
        ) +
        finiteNumber(
          request.readData(FOUNDATION_GRAPH_IDS.add.ports.b),
          'Add B',
        ),
    },
  }))

  register(FOUNDATION_GRAPH_IDS.addVec3.nodeType, (request) => {
    const left = vec3(
      request.readData(FOUNDATION_GRAPH_IDS.addVec3.ports.a),
      'Add Vec3 A',
    )
    const right = vec3(
      request.readData(FOUNDATION_GRAPH_IDS.addVec3.ports.b),
      'Add Vec3 B',
    )
    return {
      data: {
        [FOUNDATION_GRAPH_IDS.addVec3.ports.result]: [
          left[0] + right[0],
          left[1] + right[1],
          left[2] + right[2],
        ],
      },
    }
  })

  register(FOUNDATION_GRAPH_IDS.formatNumber.nodeType, (request) => {
    const prefix = request.node.properties.prefix
    const suffix = request.node.properties.suffix
    if (typeof prefix !== 'string' || typeof suffix !== 'string') {
      throw new TypeError('Format Number prefix and suffix must be strings')
    }
    return {
      data: {
        [FOUNDATION_GRAPH_IDS.formatNumber.ports.result]:
          `${prefix}${finiteNumber(
            request.readData(FOUNDATION_GRAPH_IDS.formatNumber.ports.value),
            'Format Number value',
          )}${suffix}`,
      },
    }
  })

  register(FOUNDATION_GRAPH_IDS.greaterThan.nodeType, (request) => ({
    data: {
      [FOUNDATION_GRAPH_IDS.greaterThan.ports.result]:
        finiteNumber(
          request.readData(FOUNDATION_GRAPH_IDS.greaterThan.ports.a),
          'Greater Than A',
        ) > finiteNumber(
          request.readData(FOUNDATION_GRAPH_IDS.greaterThan.ports.b),
          'Greater Than B',
        ),
    },
  }))
}
