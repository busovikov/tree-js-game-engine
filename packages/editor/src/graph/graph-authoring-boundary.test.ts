import { describe, expect, it, vi } from 'vitest'
import { CommandBus } from '../commands/command-bus.js'
import {
  GraphAuthoringSession,
  createEmptyGraphAsset,
  type GraphAssetStorage,
} from './graph-authoring-session.js'
import {
  createLazyGraphCanvasProvider,
  type GraphCanvasProvider,
} from './graph-canvas-provider.js'

const GRAPH_ID = '10000000-0000-4000-8000-000000000001'

describe('graph authoring boundary', () => {
  it('keeps the default canvas adapter lazy and replaceable', () => {
    const replacement: GraphCanvasProvider = () => null
    const loader = vi.fn(async () => ({ default: replacement }))

    const lazyProvider = createLazyGraphCanvasProvider(loader)

    expect(loader).not.toHaveBeenCalled()
    expect(lazyProvider).not.toBe(replacement)
  })

  it('creates, saves, and reopens strict Haku graph JSON', async () => {
    const files = new Map<string, string>()
    const storage: GraphAssetStorage = {
      readText: async (path) => {
        const value = files.get(path)
        if (value === undefined) throw new Error(`Missing graph: ${path}`)
        return value
      },
      writeText: async (path, value) => {
        files.set(path, value)
      },
    }
    const session = new GraphAuthoringSession(new CommandBus(), storage)

    session.create('graphs/diagnostic.graph.json', 'Diagnostic', GRAPH_ID)
    expect(session.asset).toEqual(createEmptyGraphAsset('Diagnostic', GRAPH_ID))
    expect(session.isDirty).toBe(true)

    await session.save()
    expect(session.isDirty).toBe(false)
    expect(JSON.parse(files.get('graphs/diagnostic.graph.json')!)).toEqual(session.asset)

    session.close()
    await session.open('graphs/diagnostic.graph.json')
    expect(session.asset?.graph.id).toBe(GRAPH_ID)
    expect(session.path).toBe('graphs/diagnostic.graph.json')
    expect(session.isDirty).toBe(false)
  })

  it('rejects UI-library objects before they enter command state', () => {
    const session = new GraphAuthoringSession(new CommandBus(), {
      readText: async () => '',
      writeText: async () => undefined,
    })
    session.create('graphs/strict.graph.json', 'Strict', GRAPH_ID)

    expect(() =>
      session.replaceAsset({
        ...session.asset!,
        graph: {
          ...session.asset!.graph,
          metadata: {
            reactFlow: {
              selected: true,
            },
          },
        },
      }),
    ).toThrow(/UI-library field/)
    expect(session.asset?.graph.metadata).toEqual({})
  })
})
