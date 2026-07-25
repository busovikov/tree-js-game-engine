import { memo } from 'react'
import { findPlaygroundDemo } from '../services/playground-demos.js'

export const PlaygroundDemoBanner = memo(function PlaygroundDemoBanner({
  scenePath,
}: {
  scenePath: string | null
}) {
  const demo = scenePath ? findPlaygroundDemo(scenePath) : undefined
  if (!demo) return null

  return (
    <aside className="haku-demo-banner" aria-label="Demo instructions">
      <span title={demo.hint}>{demo.hint}</span>
      <a href={demo.sourceUrl} target="_blank" rel="noreferrer">
        Source ↗
      </a>
    </aside>
  )
})
