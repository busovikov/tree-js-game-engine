export interface Command {
  execute(): void
  undo(): void
  merge?(other: Command): Command | null
}

interface HistoryEntry {
  command: Command
  beforeStateId: number
  afterStateId: number
}

export class CommandBus {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private listeners = new Set<() => void>()
  private currentStateId = 0
  private nextStateId = 1

  execute(command: Command): void {
    command.execute()
    this.push(command, true)
  }

  /** Record a command whose execute() side effects are already applied. */
  record(command: Command): void {
    this.push(command, false)
  }

  private push(command: Command, allowMerge: boolean): void {
    const last = allowMerge ? this.undoStack[this.undoStack.length - 1] : undefined
    if (last?.command.merge) {
      const merged = last.command.merge(command)
      if (merged) {
        const afterStateId = this.nextStateId++
        this.undoStack[this.undoStack.length - 1] = {
          command: merged,
          beforeStateId: last.beforeStateId,
          afterStateId,
        }
        this.currentStateId = afterStateId
        this.redoStack = []
        this.notify()
        return
      }
    }
    const afterStateId = this.nextStateId++
    this.undoStack.push({
      command,
      beforeStateId: this.currentStateId,
      afterStateId,
    })
    this.currentStateId = afterStateId
    this.redoStack = []
    this.notify()
  }

  undo(): void {
    const entry = this.undoStack.pop()
    if (!entry) return
    entry.command.undo()
    this.currentStateId = entry.beforeStateId
    this.redoStack.push(entry)
    this.notify()
  }

  redo(): void {
    const entry = this.redoStack.pop()
    if (!entry) return
    entry.command.execute()
    this.currentStateId = entry.afterStateId
    this.undoStack.push(entry)
    this.notify()
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.currentStateId = this.nextStateId++
    this.notify()
  }

  getStateId(): number {
    return this.currentStateId
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

export const globalCommandBus = new CommandBus()
