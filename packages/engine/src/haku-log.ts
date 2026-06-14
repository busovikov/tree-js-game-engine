export type HakuLogLevel = 'info' | 'warn' | 'error'
export type HakuLogCategory = 'model' | 'scene'
export type HakuLogData = Record<string, unknown>

export interface HakuLogSink {
  write(
    level: HakuLogLevel,
    category: HakuLogCategory,
    event: string,
    data?: HakuLogData,
    error?: unknown,
  ): void
}

let sink: HakuLogSink | null = null

export function setHakuLogSink(next: HakuLogSink | null): void {
  sink = next
}

export function modelLogUrl(url: string): string {
  if (url.startsWith('blob:')) {
    return `blob:…${url.slice(-16)}`
  }
  return url
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return error
}

function write(
  level: HakuLogLevel,
  category: HakuLogCategory,
  event: string,
  data?: HakuLogData,
  error?: unknown,
): void {
  if (!sink) return

  const payload = data ? { ...data } : {}
  if (error !== undefined) {
    payload.error = serializeError(error)
  }

  sink.write(level, category, event, Object.keys(payload).length > 0 ? payload : undefined)
}

export function modelLog(event: string, data?: HakuLogData): void {
  write('info', 'model', event, data)
}

export function modelLogWarn(event: string, data?: HakuLogData): void {
  write('warn', 'model', event, data)
}

export function modelLogError(event: string, data?: HakuLogData, error?: unknown): void {
  write('error', 'model', event, data, error)
}

export function sceneLog(event: string, data?: HakuLogData): void {
  write('info', 'scene', event, data)
}

export function sceneLogWarn(event: string, data?: HakuLogData): void {
  write('warn', 'scene', event, data)
}

export function sceneLogError(event: string, data?: HakuLogData, error?: unknown): void {
  write('error', 'scene', event, data, error)
}
