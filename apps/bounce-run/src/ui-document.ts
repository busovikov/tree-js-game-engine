import { assetId } from '@haku/schema'
import { UIDocumentSchema, type UIDocument } from '@haku/ui'

const id = (value: number): string =>
  `b1200000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const BOUNCE_RUN_UI_IDS = {
  document: assetId(id(1)),
  root: id(2),
  startPanel: id(3),
  startTitle: id(4),
  startHelp: id(5),
  startButton: id(6),
  hudPanel: id(7),
  stateText: id(8),
  performanceText: id(9),
  pausePanel: id(10),
  pauseTitle: id(11),
  resumeButton: id(12),
  gameOverPanel: id(13),
  gameOverTitle: id(14),
  restartButton: id(15),
  scoreText: id(16),
  highScoreText: id(17),
  events: {
    start: id(30),
    resume: id(31),
    restart: id(32),
  },
} as const

export type UIDocumentFetch = (path: string) => Promise<{
  readonly ok: boolean
  json(): Promise<unknown>
}>

export async function loadBounceRunUIDocument(
  fetchDocument: UIDocumentFetch = fetch,
): Promise<UIDocument> {
  const response = await fetchDocument('/assets/ui/hud.ui.json')
  if (!response.ok) throw new Error('Failed to load Bounce Run HUD')
  return UIDocumentSchema.parse(await response.json())
}
