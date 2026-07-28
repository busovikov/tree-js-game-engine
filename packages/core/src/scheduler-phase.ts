export const SCHEDULER_PHASES = [
  'FrameInput',
  'AccumulateTime',
  'FixedInputSnapshot',
  'FixedPrePhysics',
  'PhysicsStep',
  'PostPhysics',
  'FixedGameplay',
  'FrameGameplay',
  'LateUpdate',
  'Presentation',
  'Render',
] as const

export type SchedulerPhase = (typeof SCHEDULER_PHASES)[number]
export type SchedulerSourcePhase = SchedulerPhase | 'External'
