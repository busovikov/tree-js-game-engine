import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { targetProjectPath } from './target-project.js'

/** Matches `VEHICLE_DEBUG_LOG_RELATIVE_PATH` in @haku/engine. */
export const VEHICLE_LOG_RELATIVE_PATH = '.haku/vehicle-physics.ndjson'

export function vehicleLogFilePath(targetPath = targetProjectPath()): string {
  return join(targetPath, VEHICLE_LOG_RELATIVE_PATH)
}

export type VehicleLogRecord =
  | {
      kind: 'session'
      event: 'start' | 'stop'
      t: number
      intervalMs?: number
      historySize?: number
    }
  | {
      kind: 'sample'
      t: number
      hasFlags: boolean
      summary: {
        y: string
        vy: string
        speedKmh: string
        grounded: boolean
        wheels: string
        engineForce: string
        brake: string
        flags: string[]
      }
      snapshot: {
        seq: number
        position: [number, number, number]
        speedKmh: number
        flags: string[]
        drive: { currentSteer: number; engineForce: number }
        wheels: Array<{ inContact: boolean; steering: number }>
      }
    }

export function parseVehicleLogFile(content: string): VehicleLogRecord[] {
  const records: VehicleLogRecord[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    try {
      records.push(JSON.parse(trimmed) as VehicleLogRecord)
    } catch {
      // skip malformed lines
    }
  }
  return records
}

export function readVehicleLogFile(targetPath = targetProjectPath()): VehicleLogRecord[] {
  const path = vehicleLogFilePath(targetPath)
  if (!existsSync(path)) {
    return []
  }
  return parseVehicleLogFile(readFileSync(path, 'utf8'))
}

export function vehicleLogSamples(records: VehicleLogRecord[]) {
  return records.filter((r): r is Extract<VehicleLogRecord, { kind: 'sample' }> => r.kind === 'sample')
}

export function vehicleLogFlagged(records: VehicleLogRecord[]) {
  return vehicleLogSamples(records).filter((s) => s.hasFlags || s.summary.flags.length > 0)
}

/** Wait until the target project log file has at least `minLines` NDJSON records. */
export async function waitForVehicleLogLines(
  minLines: number,
  options: { targetPath?: string; timeoutMs?: number; pollMs?: number } = {},
): Promise<VehicleLogRecord[]> {
  const targetPath = options.targetPath ?? targetProjectPath()
  const timeoutMs = options.timeoutMs ?? 30_000
  const pollMs = options.pollMs ?? 200
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const records = readVehicleLogFile(targetPath)
    if (records.length >= minLines) {
      return records
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }

  return readVehicleLogFile(targetPath)
}
