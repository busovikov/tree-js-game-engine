import { memo } from 'react'
import './welcome-screen.css'

export const WelcomeScreen = memo(function WelcomeScreen({
  canCreate,
  onOpen,
  onCreate,
  onTryDemo,
}: {
  canCreate: boolean
  onOpen: () => void | Promise<void>
  onCreate: () => void | Promise<void>
  onTryDemo: () => void | Promise<void>
}) {
  return (
    <main className="haku-welcome">
      <section className="haku-welcome__card" aria-labelledby="haku-welcome-title">
        <span className="haku-welcome__eyebrow">@haku Editor</span>
        <h1 id="haku-welcome-title">Build a scene</h1>
        <p>Open an existing project, create one on disk, or explore a working demo.</p>
        <div className="haku-welcome__actions">
          <button type="button" className="haku-welcome__primary" onClick={onOpen}>
            Open project
          </button>
          <button type="button" disabled={!canCreate} onClick={onCreate}>
            Create project
          </button>
          <button type="button" onClick={onTryDemo}>
            Try a demo
          </button>
        </div>
        {!canCreate && (
          <small>Project creation requires a browser with the File System Access API.</small>
        )}
      </section>
    </main>
  )
})
