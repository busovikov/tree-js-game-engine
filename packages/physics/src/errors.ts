/** Thrown when a physics operation runs before the backend is initialized. */
export class PhysicsNotInitializedError extends Error {
  constructor(message = 'Physics backend is not initialized') {
    super(message)
    this.name = 'PhysicsNotInitializedError'
  }
}

/** Thrown when a body, shape, or wheel handle is unknown to the backend. */
export class PhysicsHandleNotFoundError extends Error {
  constructor(kind: string, value: string) {
    super(`Physics ${kind} handle not found: ${value}`)
    this.name = 'PhysicsHandleNotFoundError'
  }
}
