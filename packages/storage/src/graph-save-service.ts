import type { ISaveStorage } from './contracts.js'

export interface StorageGraphServiceOptions {
  readonly slotId: string
  readonly label: string
}

export interface StorageGraphService {
  load(key: string): Promise<unknown>
  save(key: string, value: unknown): Promise<void>
}

export function createStorageGraphService(
  storage: ISaveStorage,
  options: StorageGraphServiceOptions,
): StorageGraphService {
  assertNonEmpty(options.slotId, 'Graph save slot ID')
  assertNonEmpty(options.label, 'Graph save slot label')
  let writeBarrier = Promise.resolve()

  return {
    async load(key) {
      assertNonEmpty(key, 'Graph save key')
      await writeBarrier
      const slot = await storage.readSlot<Readonly<Record<string, unknown>>>(
        options.slotId,
      )
      const data = slot?.data
      if (data === undefined) return undefined
      assertRecord(data)
      return Object.hasOwn(data, key) ? structuredClone(data[key]) : undefined
    },
    save(key, value) {
      assertNonEmpty(key, 'Graph save key')
      const operation = writeBarrier.then(async () => {
        const current = await storage.readSlot<Readonly<Record<string, unknown>>>(
          options.slotId,
        )
        const data = current?.data ?? {}
        assertRecord(data)
        await storage.writeSlot({
          slotId: options.slotId,
          label: options.label,
          data: {
            ...structuredClone(data),
            [key]: structuredClone(value),
          },
          expectedRevision: current?.metadata.revision ?? 0,
        })
      })
      writeBarrier = operation.then(
        () => undefined,
        () => undefined,
      )
      return operation
    },
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new TypeError(`${label} must not be empty`)
}

function assertRecord(
  value: unknown,
): asserts value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Graph save slot data must be an object')
  }
}
