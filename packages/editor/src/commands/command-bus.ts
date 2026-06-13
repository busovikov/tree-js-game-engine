export interface Command {
  execute(): void
  undo(): void
  merge?(other: Command): Command | null
}

export class CommandBus {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private listeners = new Set<() => void>()

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
    if (last?.merge) {
      const merged = last.merge(command)
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged
        this.redoStack = []
        this.notify()
        return
      }
    }
    this.undoStack.push(command)
    this.redoStack = []
    this.notify()
  }

  undo(): void {
    const command = this.undoStack.pop()
    if (!command) return
    command.undo()
    this.redoStack.push(command)
    this.notify()
  }

  redo(): void {
    const command = this.redoStack.pop()
    if (!command) return
    command.execute()
    this.undoStack.push(command)
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
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

export const globalCommandBus = new CommandBus()
