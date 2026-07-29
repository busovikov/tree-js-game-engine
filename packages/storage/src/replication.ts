import { SaveStorageSerializationError } from './index.js'

export type SaveReplicationMode = 'none' | 'explicit' | 'platform-managed'

export interface SaveReplicationCapabilities {
  mode: SaveReplicationMode
  explicitTransfer: boolean
  conflictDetection: boolean
  platformManaged: boolean
  numericStats: boolean
}

export interface SaveReplicationAdapterBase {
  readonly mode: SaveReplicationMode
  queryCapabilities(): Promise<SaveReplicationCapabilities>
}

export interface ExplicitReplicationRecord<TData = unknown> {
  slotId: string
  revision: number
  updatedAt: string
  data: TData
}

export interface ExplicitReplicationPush<TData = unknown> {
  slotId: string
  data: TData
  expectedRevision: number
}

export interface ExplicitNumericStats {
  get(keys?: readonly string[]): Promise<Record<string, number>>
  set(stats: Readonly<Record<string, number>>): Promise<void>
}

export interface ExplicitReplicationAdapter extends SaveReplicationAdapterBase {
  readonly mode: 'explicit'
  readonly numericStats?: ExplicitNumericStats
  pull<TData = unknown>(
    slotId: string,
  ): Promise<ExplicitReplicationRecord<TData> | undefined>
  push<TData>(
    request: ExplicitReplicationPush<TData>,
  ): Promise<ExplicitReplicationRecord<TData>>
  flush(): Promise<void>
}

export interface NoSaveReplicationAdapter extends SaveReplicationAdapterBase {
  readonly mode: 'none'
}

export interface ManagedSaveReplicationAdapter extends SaveReplicationAdapterBase {
  readonly mode: 'platform-managed'
}

export type SaveReplicationAdapter =
  | NoSaveReplicationAdapter
  | ExplicitReplicationAdapter
  | ManagedSaveReplicationAdapter

const NONE_CAPABILITIES: SaveReplicationCapabilities = {
  mode: 'none',
  explicitTransfer: false,
  conflictDetection: false,
  platformManaged: false,
  numericStats: false,
}

const PLATFORM_MANAGED_CAPABILITIES: SaveReplicationCapabilities = {
  mode: 'platform-managed',
  explicitTransfer: false,
  conflictDetection: false,
  platformManaged: true,
  numericStats: false,
}

export class NoReplicationAdapter implements NoSaveReplicationAdapter {
  readonly mode = 'none' as const

  async queryCapabilities(): Promise<SaveReplicationCapabilities> {
    return { ...NONE_CAPABILITIES }
  }
}

export class PlatformManagedReplicationAdapter
implements ManagedSaveReplicationAdapter {
  readonly mode = 'platform-managed' as const

  async queryCapabilities(): Promise<SaveReplicationCapabilities> {
    return { ...PLATFORM_MANAGED_CAPABILITIES }
  }
}

export class ReplicationConflictError extends Error {
  readonly slotId: string
  readonly expectedRevision: number
  readonly actualRevision: number

  constructor(slotId: string, expectedRevision: number, actualRevision: number) {
    super(
      `Replicated save ${slotId} has revision ${actualRevision}; expected ${expectedRevision}`,
    )
    this.name = 'ReplicationConflictError'
    this.slotId = slotId
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

export class ReplicationSizeLimitError extends Error {
  readonly requestedBytes: number
  readonly maxPayloadBytes: number

  constructor(requestedBytes: number, maxPayloadBytes: number) {
    super(
      `Replication payload uses ${requestedBytes} bytes; limit is ${maxPayloadBytes}`,
    )
    this.name = 'ReplicationSizeLimitError'
    this.requestedBytes = requestedBytes
    this.maxPayloadBytes = maxPayloadBytes
  }
}

export class ReplicationRateLimitError extends Error {
  readonly maxOperations: number
  readonly windowMs: number

  constructor(maxOperations: number, windowMs: number) {
    super(
      `Replication allows ${maxOperations} operations per ${windowMs}ms window`,
    )
    this.name = 'ReplicationRateLimitError'
    this.maxOperations = maxOperations
    this.windowMs = windowMs
  }
}

export interface MockExplicitReplicationOptions {
  maxPayloadBytes?: number
  maxOperationsPerWindow?: number
  rateWindowMs?: number
  numericStats?: boolean
  now?: () => string
  nowMs?: () => number
}

export class MockExplicitReplicationAdapter
implements ExplicitReplicationAdapter {
  readonly mode = 'explicit' as const
  readonly numericStats: ExplicitNumericStats | undefined

  private readonly records = new Map<string, ExplicitReplicationRecord>()
  private readonly stats = new Map<string, number>()
  private readonly maxPayloadBytes: number
  private readonly maxOperationsPerWindow: number
  private readonly rateWindowMs: number
  private readonly now: () => string
  private readonly nowMs: () => number
  private operationTimestamps: number[] = []

  constructor(options: MockExplicitReplicationOptions = {}) {
    this.maxPayloadBytes = options.maxPayloadBytes ?? Number.POSITIVE_INFINITY
    this.maxOperationsPerWindow =
      options.maxOperationsPerWindow ?? Number.POSITIVE_INFINITY
    this.rateWindowMs = options.rateWindowMs ?? 60_000
    this.now = options.now ?? (() => new Date().toISOString())
    this.nowMs = options.nowMs ?? (() => Date.now())
    this.numericStats = options.numericStats === true
      ? {
          get: async (keys) => this.getNumericStats(keys),
          set: async (stats) => this.setNumericStats(stats),
        }
      : undefined
  }

  async queryCapabilities(): Promise<SaveReplicationCapabilities> {
    return {
      mode: 'explicit',
      explicitTransfer: true,
      conflictDetection: true,
      platformManaged: false,
      numericStats: this.numericStats !== undefined,
    }
  }

  async pull<TData = unknown>(
    slotId: string,
  ): Promise<ExplicitReplicationRecord<TData> | undefined> {
    this.recordOperation()
    const record = this.records.get(slotId)
    return record === undefined
      ? undefined
      : cloneReplicationValue(record as ExplicitReplicationRecord<TData>)
  }

  async push<TData>(
    request: ExplicitReplicationPush<TData>,
  ): Promise<ExplicitReplicationRecord<TData>> {
    const data = cloneReplicationValue(request.data)
    const requestedBytes = payloadBytes(data)
    if (requestedBytes > this.maxPayloadBytes) {
      throw new ReplicationSizeLimitError(requestedBytes, this.maxPayloadBytes)
    }
    this.recordOperation()
    const current = this.records.get(request.slotId)
    const actualRevision = current?.revision ?? 0
    if (request.expectedRevision !== actualRevision) {
      throw new ReplicationConflictError(
        request.slotId,
        request.expectedRevision,
        actualRevision,
      )
    }
    const record: ExplicitReplicationRecord<TData> = {
      slotId: request.slotId,
      revision: actualRevision + 1,
      updatedAt: this.now(),
      data,
    }
    this.records.set(request.slotId, record)
    return cloneReplicationValue(record)
  }

  async flush(): Promise<void> {
    this.recordOperation()
  }

  private async getNumericStats(
    keys?: readonly string[],
  ): Promise<Record<string, number>> {
    this.recordOperation()
    const selected = keys ?? [...this.stats.keys()]
    return Object.fromEntries(
      selected.flatMap((key) => {
        const value = this.stats.get(key)
        return value === undefined ? [] : [[key, value]]
      }),
    )
  }

  private async setNumericStats(
    stats: Readonly<Record<string, number>>,
  ): Promise<void> {
    for (const [key, value] of Object.entries(stats)) {
      if (!Number.isFinite(value)) {
        throw new TypeError(`Numeric stat ${key} must be finite`)
      }
    }
    this.recordOperation()
    for (const [key, value] of Object.entries(stats)) {
      this.stats.set(key, value)
    }
  }

  private recordOperation(): void {
    const now = this.nowMs()
    this.operationTimestamps = this.operationTimestamps.filter(
      (timestamp) => now - timestamp < this.rateWindowMs,
    )
    if (this.operationTimestamps.length >= this.maxOperationsPerWindow) {
      throw new ReplicationRateLimitError(
        this.maxOperationsPerWindow,
        this.rateWindowMs,
      )
    }
    this.operationTimestamps.push(now)
  }
}

function cloneReplicationValue<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch (error) {
    throw new SaveStorageSerializationError(error)
  }
}

function payloadBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value)
    if (json === undefined) throw new TypeError('Payload has no JSON representation')
    return new TextEncoder().encode(json).byteLength
  } catch (error) {
    throw new SaveStorageSerializationError(error)
  }
}
