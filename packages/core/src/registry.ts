import type { ComponentRegistry, ComponentType } from './types.js'

export class DefaultComponentRegistry implements ComponentRegistry {
  private readonly types = new Map<string, ComponentType>()

  register(type: ComponentType): void {
    this.types.set(type.id, type)
  }

  get(typeId: string): ComponentType | undefined {
    return this.types.get(typeId)
  }

  all(): ComponentType[] {
    return [...this.types.values()]
  }
}

export const globalComponentRegistry = new DefaultComponentRegistry()
