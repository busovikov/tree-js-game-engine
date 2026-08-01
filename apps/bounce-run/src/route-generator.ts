export interface BounceRunRouteConfig {
  readonly seed: number
  readonly platformCount: number
}

export interface BounceRunRoutePlatform {
  readonly index: number
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
}

export interface BounceRunRouteDecision {
  readonly platformIndex: number
  readonly randomValue: number
}

export interface BounceRunRoute {
  readonly platforms: readonly BounceRunRoutePlatform[]
  readonly decisionLog: readonly BounceRunRouteDecision[]
}

/** Creates a route without reading or mutating runtime state. */
export function generateBounceRunRoute(config: BounceRunRouteConfig): BounceRunRoute {
  const random = createMulberry32(config.seed)
  const platforms: BounceRunRoutePlatform[] = []
  const decisionLog: BounceRunRouteDecision[] = []

  for (let index = 0; index < config.platformCount; index += 1) {
    const randomValue = random()
    platforms.push({
      index,
      position: [index === 0 ? 0 : (randomValue - 0.5) * 2, 0, 2 + index * 7],
      size: index === 0 ? [6, 0.6, 8] : [4, 0.6, 4.2],
    })
    decisionLog.push({ platformIndex: index, randomValue })
  }

  return { platforms, decisionLog }
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}
