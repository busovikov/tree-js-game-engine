import { componentTypeId } from '@haku/schema'

export const CORE_COMPONENT_TYPE_IDS = {
  Transform: componentTypeId('40000000-0000-4000-8000-000000000001'),
  ScriptRef: componentTypeId('40000000-0000-4000-8000-000000000005'),
  PrefabInstance: componentTypeId('40000000-0000-4000-8000-000000000006'),
  Tag: componentTypeId('40000000-0000-4000-8000-000000000007'),
  Static: componentTypeId('40000000-0000-4000-8000-000000000008'),
} as const
