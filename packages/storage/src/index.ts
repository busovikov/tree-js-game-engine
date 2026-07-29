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
}

export interface InMemorySaveStorageOptions {
  now?: () => string
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

export class InMemorySaveStorage implements ISaveStorage {
  private readonly slots = new Map<string, SaveSlotRecord>()
  private readonly replayArtifacts = new Map<string, ReplayArtifactRecord>()
  private readonly now: () => string

  constructor(options: InMemorySaveStorageOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString())
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
  return structuredClone(value)
}
