/** Returns true when scale components differ beyond a small epsilon. */
export function isNonUniformScale(scale: readonly [number, number, number]): boolean {
  const [x, y, z] = scale.map((component) => Math.abs(component))
  const max = Math.max(x, y, z)
  const min = Math.min(x, y, z)
  if (max < 1e-6) {
    return false
  }
  return max - min > 1e-4
}
