export type InputAxisActionBinding = {
  readonly kind: 'axis'
  readonly negative: readonly string[]
  readonly positive: readonly string[]
}

export type InputButtonActionBinding = {
  readonly kind: 'button' | 'pulse'
  readonly codes: readonly string[]
}

export type InputActionBinding =
  | InputAxisActionBinding
  | InputButtonActionBinding

export type InputActionBindings = Readonly<
  Record<string, InputActionBinding>
>

export type InputActionMapSnapshot = Readonly<
  Record<string, number | boolean>
>

export interface InputActionMap {
  keyDown(code: string, repeat: boolean): boolean
  keyUp(code: string): boolean
  snapshot(): InputActionMapSnapshot
  endFrame(): void
  releaseAll(): void
}

export function createInputActionMap(
  bindings: InputActionBindings,
): InputActionMap {
  const entries = Object.entries(bindings)
  for (const [name, binding] of entries) {
    const codes = binding.kind === 'axis'
      ? [...binding.negative, ...binding.positive]
      : binding.codes
    if (codes.length === 0) {
      throw new Error(
        `Input action "${name}" must bind at least one key code`,
      )
    }
  }

  const pressed = new Set<string>()
  const pulses = new Set<string>()
  const boundCodes = new Set(
    entries.flatMap(([, binding]) =>
      binding.kind === 'axis'
        ? [...binding.negative, ...binding.positive]
        : [...binding.codes],
    ),
  )

  return {
    keyDown(code, repeat) {
      if (!boundCodes.has(code)) return false
      pressed.add(code)
      if (!repeat) {
        for (const [name, binding] of entries) {
          if (
            binding.kind === 'pulse' &&
            binding.codes.includes(code)
          ) {
            pulses.add(name)
          }
        }
      }
      return true
    },
    keyUp(code) {
      const wasBound = boundCodes.has(code)
      pressed.delete(code)
      return wasBound
    },
    snapshot() {
      return Object.fromEntries(
        entries.map(([name, binding]) => {
          if (binding.kind === 'axis') {
            const negative = binding.negative.some((code) =>
              pressed.has(code))
            const positive = binding.positive.some((code) =>
              pressed.has(code))
            return [name, negative === positive ? 0 : positive ? 1 : -1]
          }
          if (binding.kind === 'pulse') {
            return [name, pulses.has(name)]
          }
          return [
            name,
            binding.codes.some((code) => pressed.has(code)),
          ]
        }),
      )
    },
    endFrame() {
      pulses.clear()
    },
    releaseAll() {
      pressed.clear()
      pulses.clear()
    },
  }
}
