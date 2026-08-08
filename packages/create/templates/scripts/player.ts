export interface PlayerMotion {
  lateralPosition: number
  lateralSpeed: number
}

/** Pure game algorithm example that a graph or component behavior can call. */
export function advancePlayerMotion(
  motion: PlayerMotion,
  input: number,
  deltaSeconds: number,
): PlayerMotion {
  const lateralSpeed = Math.max(-1, Math.min(1, input)) * 6
  return {
    lateralPosition: motion.lateralPosition + lateralSpeed * deltaSeconds,
    lateralSpeed,
  }
}
