export interface SaveSlotMetadata {
  slotId: string
  label: string
  revision: number
  createdAt: string
  updatedAt: string
}

export interface SaveSlotRecord<TData = unknown> {
  metadata: SaveSlotMetadata
  data: TData
}

export interface WriteSaveSlot<TData = unknown> {
  slotId: string
  label: string
  data: TData
  expectedRevision?: number
}

export interface ReplayArtifactMetadata {
  artifactId: string
  label: string
  revision: number
  createdAt: string
  updatedAt: string
}

export interface ReplayArtifactRecord<TData = unknown> {
  metadata: ReplayArtifactMetadata
  data: TData
}

export interface WriteReplayArtifact<TData = unknown> {
  artifactId: string
  label: string
  data: TData
  expectedRevision?: number
}

export interface ISaveStorage {
  writeSlot<TData>(request: WriteSaveSlot<TData>): Promise<SaveSlotRecord<TData>>
  readSlot<TData = unknown>(slotId: string): Promise<SaveSlotRecord<TData> | undefined>
  listSlots(): Promise<SaveSlotMetadata[]>
  writeReplayArtifact<TData>(
    request: WriteReplayArtifact<TData>,
  ): Promise<ReplayArtifactRecord<TData>>
  readReplayArtifact<TData = unknown>(
    artifactId: string,
  ): Promise<ReplayArtifactRecord<TData> | undefined>
  listReplayArtifacts(): Promise<ReplayArtifactMetadata[]>
  estimate(): Promise<SaveStorageEstimate>
}

export interface InMemorySaveStorageOptions {
  now?: () => string
  quotaBytes?: number
}

export interface SaveStorageEstimate {
  usage: number
  quota?: number
}

export class SaveStorageConflictError extends Error {
  readonly slotId: string
  readonly expectedRevision: number
  readonly actualRevision: number

  constructor(slotId: string, expectedRevision: number, actualRevision: number) {
    super(
      `Save slot ${slotId} has revision ${actualRevision}; expected ${expectedRevision}`,
    )
    this.name = 'SaveStorageConflictError'
    this.slotId = slotId
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

export class SaveStorageQuotaError extends Error {
  readonly usage: number
  readonly quota: number
  readonly requested: number

  constructor(usage: number, quota: number, requested: number) {
    super(
      `Save storage quota exceeded: ${usage} bytes used, ${requested} bytes requested, ${quota} bytes available`,
    )
    this.name = 'SaveStorageQuotaError'
    this.usage = usage
    this.quota = quota
    this.requested = requested
  }
}

export class SaveStorageSerializationError extends Error {
  override readonly cause: unknown

  constructor(cause: unknown) {
    super('Save storage records must contain structured-cloneable data')
    this.name = 'SaveStorageSerializationError'
    this.cause = cause
  }
}

export class InMemorySaveStorage implements ISaveStorage {
  private readonly slots = new Map<string, SaveSlotRecord>()
  private readonly replayArtifacts = new Map<string, ReplayArtifactRecord>()
  private readonly now: () => string
  private readonly quotaBytes: number | undefined

  constructor(options: InMemorySaveStorageOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.quotaBytes = options.quotaBytes
  }

  async writeSlot<TData>(request: WriteSaveSlot<TData>): Promise<SaveSlotRecord<TData>> {
    const current = this.slots.get(request.slotId)
    assertExpectedRevision(
      request.slotId,
      request.expectedRevision,
      current?.metadata.revision ?? 0,
    )
    const now = this.now()
    const record: SaveSlotRecord<TData> = {
      metadata: {
        slotId: request.slotId,
        label: request.label,
        revision: (current?.metadata.revision ?? 0) + 1,
        createdAt: current?.metadata.createdAt ?? now,
        updatedAt: now,
      },
      data: clone(request.data),
    }
    this.assertFits(record, current)
    this.slots.set(request.slotId, record)
    return clone(record)
  }

  async readSlot<TData = unknown>(
    slotId: string,
  ): Promise<SaveSlotRecord<TData> | undefined> {
    const record = this.slots.get(slotId)
    return record === undefined ? undefined : clone(record as SaveSlotRecord<TData>)
  }

  async listSlots(): Promise<SaveSlotMetadata[]> {
    return [...this.slots.values()].map((record) => clone(record.metadata))
  }

  async writeReplayArtifact<TData>(
    request: WriteReplayArtifact<TData>,
  ): Promise<ReplayArtifactRecord<TData>> {
    const current = this.replayArtifacts.get(request.artifactId)
    assertExpectedRevision(
      request.artifactId,
      request.expectedRevision,
      current?.metadata.revision ?? 0,
    )
    const now = this.now()
    const record: ReplayArtifactRecord<TData> = {
      metadata: {
        artifactId: request.artifactId,
        label: request.label,
        revision: (current?.metadata.revision ?? 0) + 1,
        createdAt: current?.metadata.createdAt ?? now,
        updatedAt: now,
      },
      data: clone(request.data),
    }
    this.assertFits(record, current)
    this.replayArtifacts.set(request.artifactId, record)
    return clone(record)
  }

  async readReplayArtifact<TData = unknown>(
    artifactId: string,
  ): Promise<ReplayArtifactRecord<TData> | undefined> {
    const record = this.replayArtifacts.get(artifactId)
    return record === undefined
      ? undefined
      : clone(record as ReplayArtifactRecord<TData>)
  }

  async listReplayArtifacts(): Promise<ReplayArtifactMetadata[]> {
    return [...this.replayArtifacts.values()].map((record) => clone(record.metadata))
  }

  async estimate(): Promise<SaveStorageEstimate> {
    return {
      usage: this.usage(),
      ...(this.quotaBytes === undefined ? {} : { quota: this.quotaBytes }),
    }
  }

  private assertFits(
    replacement: SaveSlotRecord | ReplayArtifactRecord,
    current: SaveSlotRecord | ReplayArtifactRecord | undefined,
  ): void {
    if (this.quotaBytes === undefined) return
    const usage = this.usage()
    const currentBytes = current === undefined ? 0 : recordBytes(current)
    const requested = recordBytes(replacement)
    if (usage - currentBytes + requested > this.quotaBytes) {
      throw new SaveStorageQuotaError(usage, this.quotaBytes, requested)
    }
  }

  private usage(): number {
    return [...this.slots.values(), ...this.replayArtifacts.values()]
      .reduce((total, record) => total + recordBytes(record), 0)
  }
}

function assertExpectedRevision(
  id: string,
  expectedRevision: number | undefined,
  actualRevision: number,
): void {
  if (expectedRevision !== undefined && expectedRevision !== actualRevision) {
    throw new SaveStorageConflictError(id, expectedRevision, actualRevision)
  }
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch (error) {
    throw new SaveStorageSerializationError(error)
  }
}

function recordBytes(record: SaveSlotRecord | ReplayArtifactRecord): number {
  try {
    const json = JSON.stringify(record)
    if (json === undefined) throw new TypeError('Record has no JSON representation')
    return new TextEncoder().encode(json).byteLength
  } catch (error) {
    if (error instanceof SaveStorageSerializationError) throw error
    throw new SaveStorageSerializationError(error)
  }
}
