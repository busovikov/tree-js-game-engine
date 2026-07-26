import type { ComponentRegistry, ComponentType } from './types.js'
import type { ComponentTypeId } from '@haku/schema'

export interface ComponentDiagnostic {
  readonly code: 'component-type.duplicate-id' | 'component-type.unknown-id'
  readonly severity: 'error'
  readonly message: string
  readonly componentTypeId: string
}

export class ComponentDiagnosticError extends Error {
  readonly diagnostics: readonly ComponentDiagnostic[]

  constructor(diagnostics: readonly ComponentDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'))
    this.name = 'ComponentDiagnosticError'
    this.diagnostics = diagnostics
  }
}

export class DefaultComponentRegistry implements ComponentRegistry {
  private readonly types = new Map<ComponentTypeId, ComponentType>()

  register(type: ComponentType): void {
    if (this.types.has(type.id)) {
      throw new ComponentDiagnosticError([
        {
          code: 'component-type.duplicate-id',
          severity: 'error',
          message: `Duplicate component type ID: ${type.id}`,
          componentTypeId: type.id,
        },
      ])
    }
    this.types.set(type.id, type)
  }

  get(typeId: ComponentTypeId | string): ComponentType | undefined {
    return this.types.get(typeId as ComponentTypeId)
  }

  require(typeId: ComponentTypeId | string): ComponentType {
    const type = this.get(typeId)
    if (!type) {
      throw new ComponentDiagnosticError([
        {
          code: 'component-type.unknown-id',
          severity: 'error',
          message: `Unknown component type ID: ${typeId}`,
          componentTypeId: typeId,
        },
      ])
    }
    return type
  }

  all(): readonly ComponentType[] {
    return [...this.types.values()].sort((left, right) => left.id.localeCompare(right.id))
  }
}
