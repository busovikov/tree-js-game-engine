import { UIDocumentSchema } from '@haku/ui'
import documentAsset from '../public/assets/ui/hud.ui.json'

const id = (value: number): string =>
  `b1200000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const BOUNCE_RUN_UI_IDS = {
  document: id(1),
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
  events: {
    start: id(30),
    resume: id(31),
    restart: id(32),
  },
} as const

export const bounceRunUIDocument = UIDocumentSchema.parse(documentAsset)
