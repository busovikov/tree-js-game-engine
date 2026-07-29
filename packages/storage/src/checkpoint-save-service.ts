import type {
  PersistentCheckpointRecord,
  SaveService,
} from '@haku/graph-runtime'
import {
  SaveStorageConflictError,
  type ISaveStorage,
} from './contracts.js'

export interface HakuSaveSlotData<TGameData = unknown> {
  schemaVersion: 1
  gameData: TGameData
  checkpointEntries: Record<string, PersistentCheckpointRecord>
}

export function createSaveSlotData<TGameData>(
  gameData: TGameData,
): HakuSaveSlotData<TGameData> {
  return {
    schemaVersion: 1,
    gameData: structuredClone(gameData),
    checkpointEntries: {},
  }
}

export interface SaveSlotCheckpointServiceOptions<TGameData = unknown> {
  createGameData?: () => TGameData
  labelForSlot?: (slotId: string) => string
  maxConflictRetries?: number
}

export class SaveSlotFormatError extends Error {
  readonly slotId: string

  constructor(slotId: string) {
    super(`Save slot ${slotId} does not contain a Haku save-slot v1 envelope`)
    this.name = 'SaveSlotFormatError'
    this.slotId = slotId
  }
}

export class SaveSlotCheckpointService<TGameData = unknown>
implements SaveService {
  private readonly createGameData: () => TGameData
  private readonly labelForSlot: (slotId: string) => string
  private readonly maxConflictRetries: number

  constructor(
    private readonly storage: ISaveStorage,
    options: SaveSlotCheckpointServiceOptions<TGameData> = {},
  ) {
    this.createGameData =
      options.createGameData ?? (() => undefined as TGameData)
    this.labelForSlot = options.labelForSlot ?? ((slotId) => slotId)
    this.maxConflictRetries = options.maxConflictRetries ?? 4
  }

  async saveCheckpoint(
    slotId: string,
    record: PersistentCheckpointRecord,
  ): Promise<void> {
    let lastConflict: SaveStorageConflictError | undefined
    for (let attempt = 0; attempt <= this.maxConflictRetries; attempt += 1) {
      const slot = await this.storage.readSlot<HakuSaveSlotData<TGameData>>(slotId)
      const data = slot === undefined
        ? createSaveSlotData(this.createGameData())
        : parseSaveSlotData(slotId, slot.data)
      data.checkpointEntries[record.instanceId] = structuredClone(record)
      try {
        await this.storage.writeSlot({
          slotId,
          label: slot?.metadata.label ?? this.labelForSlot(slotId),
          data,
          expectedRevision: slot?.metadata.revision ?? 0,
        })
        return
      } catch (error) {
        if (!(error instanceof SaveStorageConflictError)) throw error
        lastConflict = error
      }
    }
    throw lastConflict
  }

  async loadCheckpoint(
    slotId: string,
    instanceId: string,
  ): Promise<PersistentCheckpointRecord | undefined> {
    const slot = await this.storage.readSlot<HakuSaveSlotData<TGameData>>(slotId)
    if (slot === undefined) return undefined
    const data = parseSaveSlotData(slotId, slot.data)
    const record = data.checkpointEntries[instanceId]
    return record === undefined ? undefined : structuredClone(record)
  }
}

function parseSaveSlotData<TGameData>(
  slotId: string,
  value: unknown,
): HakuSaveSlotData<TGameData> {
  if (
    typeof value !== 'object'
    || value === null
    || !('schemaVersion' in value)
    || value.schemaVersion !== 1
    || !('checkpointEntries' in value)
    || !isRecord(value.checkpointEntries)
    || !('gameData' in value)
  ) {
    throw new SaveSlotFormatError(slotId)
  }
  return structuredClone(value) as HakuSaveSlotData<TGameData>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
