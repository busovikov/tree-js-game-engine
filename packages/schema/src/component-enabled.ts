/** Whether a serialized component is active (defaults to enabled when omitted). */
export function isComponentEnabled(data: unknown): boolean {
  if (typeof data === 'object' && data !== null && 'enabled' in data) {
    return (data as { enabled?: boolean }).enabled !== false
  }
  return true
}

export function withComponentEnabled<T extends Record<string, unknown>>(data: T, enabled: boolean): T {
  return { ...data, enabled }
}
