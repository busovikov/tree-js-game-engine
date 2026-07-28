import {
  ComponentBehaviorRunner,
  EngineScheduler,
  defineComponentBehavior,
  type ComponentBehaviorTraceEntry,
  type ComponentDefinition,
  type IWorld,
} from '@haku/core'

export function previewComponentBehaviorTrace(
  component: ComponentDefinition,
  world: IWorld,
  resolveComponent: (typeId: string) => ComponentDefinition | undefined,
): readonly ComponentBehaviorTraceEntry[] {
  const contract = component.behavior?.typescript
  if (!contract) return []

  const scheduler = new EngineScheduler()
  const behavior = defineComponentBehavior({
    id: component.id,
    name: contract.exportName,
    version: component.version ?? 1,
    domain: contract.domain,
    query: contract.query,
    reads: contract.reads,
    writes: contract.writes,
    effects: contract.effects,
    commands: contract.commands,
    updateBatch: () => [],
  })
  const runner = new ComponentBehaviorRunner(behavior, {
    scheduler,
    resolveComponent,
  })
  runner.update(world, 0)
  return runner.trace
}
