/** Collision / trigger / area overlap event emitted after a physics step batch. */
export type PhysicsEventKind = 'collision' | 'trigger' | 'area'

export type PhysicsEventPhase = 'enter' | 'exit'

export interface PhysicsContactPoint {
  point: readonly [number, number, number]
  normal: readonly [number, number, number]
  depth: number
}

export interface PhysicsCollisionEvent {
  kind: PhysicsEventKind
  phase: PhysicsEventPhase
  entityA: string
  entityB: string
  contacts?: readonly PhysicsContactPoint[]
}
