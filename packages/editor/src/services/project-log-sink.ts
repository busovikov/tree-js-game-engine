import type { HakuLogSink, HakuLogCategory, HakuLogLevel } from '@haku/engine'
import { projectService } from './project-service.js'

function formatLine(
  level: HakuLogLevel,
  category: HakuLogCategory,
  event: string,
  data?: Record<string, unknown>,
): string {
  const ts = new Date().toISOString()
  const levelLabel = level.toUpperCase().padEnd(5)
  const payload = data && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : ''
  return `${ts} ${levelLabel} [${category}] ${event}${payload}\n`
}

class ProjectLogBuffer {
  private lines: string[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  enqueue(
    level: HakuLogLevel,
    category: HakuLogCategory,
    event: string,
    data?: Record<string, unknown>,
  ): void {
    this.lines.push(formatLine(level, category, event, data))
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, 50)
  }

  private async flush(): Promise<void> {
    if (this.lines.length === 0) return
    const chunk = this.lines.join('')
    this.lines = []
    try {
      await projectService.appendProjectLog(chunk)
    } catch (error) {
      console.error('[haku] Failed to write project log', error)
    }
  }
}

const buffer = new ProjectLogBuffer()

export const projectLogSink: HakuLogSink = {
  write(level, category, event, data) {
    buffer.enqueue(level, category, event, data)
  },
}

export function logProjectSessionMarker(label: string, data?: Record<string, unknown>): void {
  buffer.enqueue('info', 'scene', `session.${label}`, data)
}
