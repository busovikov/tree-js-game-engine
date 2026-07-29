export const FOUNDATION_NODE_SDK_DECLARATIONS = `declare module '@haku/node-sdk' {
  export type Vec3 = readonly [number, number, number]
  export interface EntityRef {
    readonly $ref: \`entity:\${string}\`
  }
  export interface WorldReadCapability {
    getComponent(entity: EntityRef, componentType: string): unknown
  }
  export interface WorldWriteCapability extends WorldReadCapability {
    setComponent(entity: EntityRef, componentType: string, value: unknown): void
  }
  export interface PhysicsCapability {
    raycast(origin: Vec3, direction: Vec3, maxDistance: number): unknown
    setBodyVelocity(entity: EntityRef, velocity: Vec3): void
  }
  export interface SeededRandomCapability {
    next(): number
  }
  export interface SaveCapability {
    load(key: string): Promise<unknown>
    save(key: string, value: unknown): Promise<void>
  }
  export interface PlatformCapability {
    hasCapability(name: 'lifecycle' | 'auth' | 'pause' | 'input' | 'audio'): Promise<boolean>
  }
  export interface DebugCapability {
    log(message: string): void
    assert(condition: boolean, message: string): asserts condition
  }
  export interface NodeExecutionCapabilities {
    readonly worldRead: WorldReadCapability
    readonly worldWrite: WorldWriteCapability
    readonly physics: PhysicsCapability
    readonly random: SeededRandomCapability
    readonly storage: SaveCapability
    readonly platform: PlatformCapability
    readonly debug: DebugCapability
    readonly ui: unknown
    readonly audio: unknown
    readonly pool: unknown
  }
  export interface CustomNode<TProperties = Readonly<Record<string, unknown>>> {
    readonly id: string
    readonly properties?: TProperties
    run?(capabilities: NodeExecutionCapabilities): void | Promise<void>
  }
  export function defineCustomNode<TNode extends CustomNode>(node: TNode): TNode
}
`
