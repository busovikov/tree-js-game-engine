import type * as THREE from 'three'

export {
  modelLog,
  modelLogWarn,
  modelLogError,
  modelLogUrl,
  sceneLog,
  sceneLogWarn,
  sceneLogError,
  setHakuLogSink,
  type HakuLogSink,
  type HakuLogData,
  type HakuLogCategory,
  type HakuLogLevel,
} from './haku-log.js'

export function countObject3DMeshes(root: THREE.Object3D): number {
  let count = 0
  root.traverse((child) => {
    if (child.type === 'Mesh') count += 1
  })
  return count
}
