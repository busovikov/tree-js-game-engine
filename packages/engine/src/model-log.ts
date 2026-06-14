import type * as THREE from 'three'

const PREFIX = '[haku:model]'

export type ModelLogData = Record<string, unknown>

export function modelLogUrl(url: string): string {
  if (url.startsWith('blob:')) {
    return `blob:…${url.slice(-16)}`
  }
  return url
}

export function modelLog(event: string, data?: ModelLogData): void {
  if (data !== undefined) {
    console.log(PREFIX, event, data)
    return
  }
  console.log(PREFIX, event)
}

export function modelLogWarn(event: string, data?: ModelLogData): void {
  if (data !== undefined) {
    console.warn(PREFIX, event, data)
    return
  }
  console.warn(PREFIX, event)
}

export function modelLogError(event: string, data?: ModelLogData, error?: unknown): void {
  if (error !== undefined) {
    console.error(PREFIX, event, data ?? {}, error)
    return
  }
  if (data !== undefined) {
    console.error(PREFIX, event, data)
    return
  }
  console.error(PREFIX, event)
}

export function countObject3DMeshes(root: THREE.Object3D): number {
  let count = 0
  root.traverse((child) => {
    if (child.type === 'Mesh') count += 1
  })
  return count
}
