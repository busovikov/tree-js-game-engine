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
    super(
      'Save storage quota exceeded',
    )
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

const SAVE_SLOT_STORE = 'save-slots'
const REPLAY_ARTIFACT_STORE = 'replay-artifacts'

export interface IndexedDbSaveStorageOptions {
  databaseName?: string
  indexedDB?: IDBFactory
  now?: () => string
  estimateStorage?: () => Promise<SaveStorageEstimate>
}

export class IndexedDbSaveStorage implements ISaveStorage {
  private readonly databaseName: string
  private readonly indexedDB: IDBFactory | undefined
  private readonly now: () => string
  private readonly estimateStorage: (() => Promise<SaveStorageEstimate>) | undefined

  constructor(options: IndexedDbSaveStorageOptions = {}) {
    this.databaseName = options.databaseName ?? 'haku-save-storage'
    this.indexedDB = options.indexedDB ?? globalThis.indexedDB
    this.now = options.now ?? (() => new Date().toISOString())
    this.estimateStorage = options.estimateStorage ?? browserStorageEstimate()
  }

  async writeSlot<TData>(request: WriteSaveSlot<TData>): Promise<SaveSlotRecord<TData>> {
    return this.writeRecord(
      SAVE_SLOT_STORE,
      request.slotId,
      request.label,
      request.data,
      request.expectedRevision,
      (revision, createdAt, updatedAt, data) => ({
        metadata: {
          slotId: request.slotId,
          label: request.label,
          revision,
          createdAt,
          updatedAt,
        },
        data,
      }),
    )
  }

  async readSlot<TData = unknown>(
    slotId: string,
  ): Promise<SaveSlotRecord<TData> | undefined> {
    return this.readRecord<SaveSlotRecord<TData>>(SAVE_SLOT_STORE, slotId)
  }

  async listSlots(): Promise<SaveSlotMetadata[]> {
    const records = await this.listRecords<SaveSlotRecord>(SAVE_SLOT_STORE)
    return records.map((record) => clone(record.metadata))
  }

  async writeReplayArtifact<TData>(
    request: WriteReplayArtifact<TData>,
  ): Promise<ReplayArtifactRecord<TData>> {
    return this.writeRecord(
      REPLAY_ARTIFACT_STORE,
      request.artifactId,
      request.label,
      request.data,
      request.expectedRevision,
      (revision, createdAt, updatedAt, data) => ({
        metadata: {
          artifactId: request.artifactId,
          label: request.label,
          revision,
          createdAt,
          updatedAt,
        },
        data,
      }),
    )
  }

  async readReplayArtifact<TData = unknown>(
    artifactId: string,
  ): Promise<ReplayArtifactRecord<TData> | undefined> {
    return this.readRecord<ReplayArtifactRecord<TData>>(
      REPLAY_ARTIFACT_STORE,
      artifactId,
    )
  }

  async listReplayArtifacts(): Promise<ReplayArtifactMetadata[]> {
    const records = await this.listRecords<ReplayArtifactRecord>(
      REPLAY_ARTIFACT_STORE,
    )
    return records.map((record) => clone(record.metadata))
  }

  async estimate(): Promise<SaveStorageEstimate> {
    return this.estimateStorage === undefined ? {} : this.estimateStorage()
  }

  private async writeRecord<TRecord extends SaveSlotRecord<TData> | ReplayArtifactRecord<TData>, TData>(
    storeName: string,
    id: string,
    _label: string,
    data: TData,
    expectedRevision: number | undefined,
    create: (
      revision: number,
      createdAt: string,
      updatedAt: string,
      data: TData,
    ) => TRecord,
  ): Promise<TRecord> {
    const clonedData = clone(data)
    const database = await this.open()
    try {
      return await new Promise<TRecord>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        const read = store.get(id)
        let result: TRecord | undefined
        let operationError: unknown

        read.onsuccess = () => {
          const current = read.result as TRecord | undefined
          const actualRevision = current?.metadata.revision ?? 0
          if (
            expectedRevision !== undefined
            && expectedRevision !== actualRevision
          ) {
            operationError = new SaveStorageConflictError(
              id,
              expectedRevision,
              actualRevision,
            )
            transaction.abort()
            return
          }
          const now = this.now()
          result = create(
            actualRevision + 1,
            current?.metadata.createdAt ?? now,
            now,
            clonedData,
          )
          try {
            store.put(result, id)
          } catch (error) {
            operationError = error
            transaction.abort()
          }
        }
        read.onerror = () => {
          operationError = read.error
        }
        transaction.oncomplete = () => {
          if (result === undefined) {
            reject(new SaveStorageOperationError('IndexedDB committed without a result'))
            return
          }
          resolve(clone(result))
        }
        transaction.onabort = () => {
          reject(operationError ?? transaction.error ?? new DOMException(
            'IndexedDB transaction aborted',
            'AbortError',
          ))
        }
        transaction.onerror = () => {
          operationError ??= transaction.error
        }
      }).catch(async (error: unknown) => {
        throw await this.mapError(error, recordBytesForData(data))
      })
    } finally {
      database.close()
    }
  }

  private async readRecord<TRecord>(
    storeName: string,
    id: string,
  ): Promise<TRecord | undefined> {
    const database = await this.open()
    try {
      const transaction = database.transaction(storeName, 'readonly')
      const result = await requestResult<TRecord | undefined>(
        transaction.objectStore(storeName).get(id),
      )
      await transactionComplete(transaction)
      return result === undefined ? undefined : clone(result)
    } catch (error) {
      throw await this.mapError(error)
    } finally {
      database.close()
    }
  }

  private async listRecords<TRecord>(storeName: string): Promise<TRecord[]> {
    const database = await this.open()
    try {
      const transaction = database.transaction(storeName, 'readonly')
      const result = await requestResult<TRecord[]>(
        transaction.objectStore(storeName).getAll(),
      )
      await transactionComplete(transaction)
      return clone(result)
    } catch (error) {
      throw await this.mapError(error)
    } finally {
      database.close()
    }
  }

  private async open(): Promise<IDBDatabase> {
    if (this.indexedDB === undefined) throw new SaveStorageUnavailableError()
    try {
      return await new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.indexedDB!.open(this.databaseName, 1)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains(SAVE_SLOT_STORE)) {
            database.createObjectStore(SAVE_SLOT_STORE)
          }
          if (!database.objectStoreNames.contains(REPLAY_ARTIFACT_STORE)) {
            database.createObjectStore(REPLAY_ARTIFACT_STORE)
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new DOMException(
          'IndexedDB open request was blocked',
          'InvalidStateError',
        ))
      })
    } catch (error) {
      throw new SaveStorageUnavailableError(error)
    }
  }

  private async mapError(error: unknown, requested?: number): Promise<Error> {
    if (
      error instanceof SaveStorageConflictError
      || error instanceof SaveStorageSerializationError
      || error instanceof SaveStorageUnavailableError
    ) {
      return error
    }
    if (domExceptionName(error) === 'DataCloneError') {
      return new SaveStorageSerializationError(error)
    }
    if (domExceptionName(error) === 'QuotaExceededError') {
      const estimate: SaveStorageEstimate = await this.estimate().catch(() => ({}))
      return new SaveStorageQuotaError(estimate.usage, estimate.quota, requested)
    }
    return new SaveStorageOperationError(error)
  }
}

function browserStorageEstimate():
  | (() => Promise<SaveStorageEstimate>)
  | undefined {
  if (globalThis.navigator?.storage?.estimate === undefined) return undefined
  return async () => {
    const estimate = await globalThis.navigator.storage.estimate()
    return {
      ...(estimate.usage === undefined ? {} : { usage: estimate.usage }),
      ...(estimate.quota === undefined ? {} : { quota: estimate.quota }),
    }
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}

function domExceptionName(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String(error.name)
    : undefined
}

function recordBytesForData(data: unknown): number | undefined {
  try {
    const json = JSON.stringify(data)
    return json === undefined ? undefined : new TextEncoder().encode(json).byteLength
  } catch {
    return undefined
  }
}

export * from './replication.js'
export * from './checkpoint-save-service.js'
