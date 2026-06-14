export const LIGHT_TEMPERATURE_MIN = 1000
export const LIGHT_TEMPERATURE_MAX = 12000
export const LIGHT_TEMPERATURE_DEFAULT = 6500

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/** Approximate blackbody RGB for color temperature in Kelvin (1000–12000). */
export function kelvinToRgb(kelvin: number): { r: number; g: number; b: number } {
  const temp = Math.max(LIGHT_TEMPERATURE_MIN, Math.min(LIGHT_TEMPERATURE_MAX, kelvin)) / 100
  let r: number
  let g: number
  let b: number

  if (temp <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(temp) - 161.1195681661
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492)
    b = 255
  }

  return {
    r: clampByte(r),
    g: clampByte(g),
    b: clampByte(b),
  }
}

export function kelvinToHex(kelvin: number): string {
  const { r, g, b } = kelvinToRgb(kelvin)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function resolveLightColor(light: { color: string; colorTemperature?: number }): string {
  if (light.colorTemperature !== undefined) {
    return kelvinToHex(light.colorTemperature)
  }
  return light.color
}
