/** Thrown when Rapier WASM fails to load or initialize. */
export class PhysicsWasmInitError extends Error {
  constructor(cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause ?? 'unknown error')
    super(`Failed to initialize Rapier WASM: ${detail}`)
    this.name = 'PhysicsWasmInitError'
  }
}
