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

export interface SaveStorageEstimate {
  usage?: number
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
  readonly usage: number | undefined
  readonly quota: number | undefined
  readonly requested: number | undefined

  constructor(
    usage: number | undefined,
    quota: number | undefined,
    requested: number | undefined,
  ) {
    super('Save storage quota exceeded')
    this.name = 'SaveStorageQuotaError'
    this.usage = usage
    this.quota = quota
    this.requested = requested
  }
}

export class SaveStorageUnavailableError extends Error {
  override readonly cause: unknown

  constructor(cause?: unknown) {
    super('IndexedDB save storage is unavailable')
    this.name = 'SaveStorageUnavailableError'
    this.cause = cause
  }
}

export class SaveStorageOperationError extends Error {
  override readonly cause: unknown

  constructor(cause: unknown) {
    super('Save storage operation failed')
    this.name = 'SaveStorageOperationError'
    this.cause = cause
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
