import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import { World } from '@haku/core'
import { DIAGNOSTIC_GRAPH_IDS } from '@haku/graph'
import { runDiagnosticGraphPlan } from '@haku/graph-runtime'
import { projectService } from '../services/project-service.js'
import { prepareBeforeUnload } from '../services/unsaved-changes.js'
import { DefaultGraphCanvasProvider } from './graph-canvas-provider.js'
import {
  createGraphInspectorModel,
  searchGraphPalette,
} from './graph-editor-model.js'
import {
  graphAuthoringSession,
  graphCommandBus,
  graphNodeRegistry,
} from './graph-editor-service.js'
import './graph-editor-panel.css'

function confirmDiscard(): boolean {
  return !graphAuthoringSession.isDirty ||
    window.confirm('Discard unsaved graph changes?')
}

export const GraphEditorPanel = memo(function GraphEditorPanel() {
  const [, refresh] = useReducer((value) => value + 1, 0)
  const [query, setQuery] = useState('')
  const [propertyText, setPropertyText] = useState('{}')
  const [trace, setTrace] = useState<ReturnType<typeof runDiagnosticGraphPlan>['trace']>([])
  const [portValues, setPortValues] = useState<Readonly<Record<string, unknown>>>({})
  const [status, setStatus] = useState('Ready')

  useEffect(() => graphAuthoringSession.subscribe(refresh), [])
  useEffect(() => graphCommandBus.subscribe(refresh), [])
  useEffect(() => {
    if (!graphAuthoringSession.isDirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => prepareBeforeUnload(event, true)
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  })

  const asset = graphAuthoringSession.asset
  const compiled = useMemo(
    () => asset ? graphAuthoringSession.compile() : { diagnostics: [] },
    [asset],
  )
  const selectedNodeId = graphAuthoringSession.selectedNodeIds[0]
  const inspector = useMemo(
    () => asset
      ? createGraphInspectorModel(asset, graphNodeRegistry, compiled, selectedNodeId)
      : { diagnostics: [] },
    [asset, compiled, selectedNodeId],
  )
  useEffect(() => {
    setPropertyText(JSON.stringify(inspector.selectedNode?.properties ?? {}, null, 2))
  }, [inspector.selectedNode?.id, inspector.selectedNode?.properties])
  const palette = useMemo(
    () => searchGraphPalette(graphNodeRegistry, query),
    [query],
  )

  const createGraph = useCallback(async () => {
    if (!confirmDiscard()) return
    const name = window.prompt('Graph name', 'Gameplay Graph')?.trim()
    if (!name) return
    const fileName = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'graph'
    const path = window.prompt(
      'Graph path',
      `${projectService.getAssetsRoot()}/graphs/${fileName}.graph.json`,
    )?.trim()
    if (!path) return
    try {
      const created = await projectService.createGraphAsset(path, name)
      graphAuthoringSession.openAsset(path, created)
      setStatus(`Created ${path}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Create failed')
    }
  }, [])

  const openGraph = useCallback(async () => {
    if (!confirmDiscard()) return
    const path = window.prompt(
      'Graph path',
      `${projectService.getAssetsRoot()}/graphs/diagnostic.graph.json`,
    )?.trim()
    if (!path) return
    try {
      await graphAuthoringSession.open(path)
      setStatus(`Opened ${path}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Open failed')
    }
  }, [])

  const saveGraph = useCallback(async () => {
    try {
      await graphAuthoringSession.save()
      setStatus(`Saved ${graphAuthoringSession.path}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed')
    }
  }, [])

  const playGraph = useCallback(() => {
    if (!compiled.plan || compiled.diagnostics.some((item) => item.severity === 'error')) {
      setStatus('Play blocked by compiler errors')
      return
    }
    if (compiled.plan.graphId !== DIAGNOSTIC_GRAPH_IDS.graph) {
      setStatus('No runtime adapters registered for this graph')
      return
    }
    const run = runDiagnosticGraphPlan(compiled.plan, new World())
    setTrace(run.trace)
    setPortValues(run.portValues)
    setStatus(`Played plan ${run.planFingerprint}`)
  }, [compiled])

  if (!asset) {
    return <div className="haku-graph-editor haku-graph-editor--empty">No graph open</div>
  }

  return (
    <section
      className="haku-graph-editor"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey) {
          if (event.key.toLowerCase() === 'c') graphAuthoringSession.copySelection()
          if (event.key.toLowerCase() === 'v') graphAuthoringSession.paste()
          if (event.key.toLowerCase() === 'd') graphAuthoringSession.duplicateSelection()
          return
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
          graphAuthoringSession.deleteSelection()
        }
      }}
    >
      <div className="haku-graph-editor__toolbar">
        <button type="button" onClick={() => void createGraph()}>New</button>
        <button type="button" onClick={() => void openGraph()}>Open</button>
        <button
          type="button"
          disabled={!graphAuthoringSession.isDirty || graphAuthoringSession.path?.startsWith('builtin:')}
          onClick={() => void saveGraph()}
        >
          Save
        </button>
        <button type="button" disabled={!graphCommandBus.canUndo()} onClick={() => graphCommandBus.undo()}>
          Undo
        </button>
        <button type="button" disabled={!graphCommandBus.canRedo()} onClick={() => graphCommandBus.redo()}>
          Redo
        </button>
        <button type="button" onClick={() => graphAuthoringSession.copySelection()}>Copy</button>
        <button type="button" onClick={() => graphAuthoringSession.paste()}>Paste</button>
        <button type="button" onClick={() => graphAuthoringSession.duplicateSelection()}>Duplicate</button>
        <button type="button" onClick={() => graphAuthoringSession.deleteSelection()}>Delete</button>
        <button type="button" onClick={playGraph}>▶ Play Graph</button>
        <span>{graphAuthoringSession.path}{graphAuthoringSession.isDirty ? ' *' : ''}</span>
      </div>
      <div className="haku-graph-editor__workspace">
        <aside className="haku-graph-editor__palette">
          <h3>Palette</h3>
          <input
            aria-label="Search graph nodes"
            placeholder="Search nodes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {palette.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.description}
              onClick={() => graphAuthoringSession.addNode(
                item.id,
                { x: 80 + asset.graph.nodes.length * 24, y: 80 },
                item.id === DIAGNOSTIC_GRAPH_IDS.nodeTypes.markWorld
                  ? { tag: 'graph-authored' }
                  : {},
              )}
            >
              <small>{item.category}</small>
              {item.name}
            </button>
          ))}
        </aside>
        <main className="haku-graph-editor__canvas">
          <Suspense fallback={<div className="haku-graph-editor__loading">Loading graph canvas…</div>}>
            <DefaultGraphCanvasProvider
              asset={asset}
              selectedNodeIds={graphAuthoringSession.selectedNodeIds}
              diagnostics={compiled.diagnostics}
              trace={trace}
              portValues={portValues}
              onSelectNodes={(ids) => graphAuthoringSession.selectNodes(ids)}
              onMoveNodes={(moves) => graphAuthoringSession.moveNodes(moves)}
              onDeleteNodes={(ids) => {
                graphAuthoringSession.selectNodes(ids)
                graphAuthoringSession.deleteSelection()
              }}
              onDeleteConnections={(ids) => graphAuthoringSession.deleteConnections(ids)}
              canConnect={(from, to) => graphAuthoringSession.canConnect(from, to).valid}
              onConnect={(from, to) => graphAuthoringSession.connect(from, to)}
            />
          </Suspense>
        </main>
        <aside className="haku-graph-editor__inspector">
          <h3>Inspector</h3>
          {inspector.selectedNode ? (
            <>
              <strong>{inspector.selectedNode.name}</strong>
              <p>{inspector.selectedNode.description}</p>
              <label>
                Properties JSON
                <textarea
                  value={propertyText}
                  onChange={(event) => setPropertyText(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  try {
                    graphAuthoringSession.updateNodeProperties(
                      inspector.selectedNode!.id,
                      JSON.parse(propertyText),
                    )
                    setStatus('Properties applied')
                  } catch (error) {
                    setStatus(error instanceof Error ? error.message : 'Invalid properties')
                  }
                }}
              >
                Apply properties
              </button>
              <p>Effects: {inspector.selectedNode.effects.join(', ') || 'none'}</p>
              <p>
                Async policies: {inspector.selectedNode.asyncCheckpointPolicies.join(', ') || 'none'}
              </p>
              {inspector.checkpoint && (
                <div className="haku-graph-editor__checkpoint">
                  <strong>Checkpoint: {inspector.checkpoint.eligible ? 'eligible' : 'rejected'}</strong>
                  {inspector.checkpoint.dynamicPhysicsRejected && (
                    <p>Dynamic physics state cannot be checkpointed.</p>
                  )}
                  {inspector.checkpoint.asyncPolicies.map((policy) => (
                    <p key={policy.callsiteId}>
                      Async {policy.callsiteId.slice(0, 8)}: {policy.supported.join(', ')}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p>Select a graph node</p>
          )}
          <h3>Diagnostics</h3>
          {inspector.diagnostics.length === 0 ? <p>No diagnostics</p> : inspector.diagnostics.map((item, index) => (
            <button
              key={`${item.code}:${index}`}
              type="button"
              className={`haku-graph-editor__diagnostic haku-graph-editor__diagnostic--${item.severity}`}
              onClick={() => item.navigateTo.nodeId &&
                graphAuthoringSession.selectNodes([item.navigateTo.nodeId])}
            >
              {item.code}: {item.message}
            </button>
          ))}
        </aside>
      </div>
      <footer className="haku-graph-editor__status" role="status">{status}</footer>
    </section>
  )
})
