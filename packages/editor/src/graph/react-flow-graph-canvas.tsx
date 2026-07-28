import { memo, useCallback, useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GraphNode } from '@haku/graph'
import type { GraphCanvasProviderProps } from './graph-canvas-provider.js'
import './react-flow-graph-canvas.css'

interface HakuNodeData extends Record<string, unknown> {
  readonly node: GraphNode
  readonly diagnostic: boolean
  readonly active: boolean
  readonly portValues: Readonly<Record<string, unknown>>
}

type HakuFlowNode = Node<HakuNodeData, 'haku'>

const HakuNode = memo(function HakuNode({ data }: NodeProps<HakuFlowNode>) {
  return (
    <div
      className={[
        'haku-graph-node',
        data.diagnostic ? 'haku-graph-node--diagnostic' : '',
        data.active ? 'haku-graph-node--active' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="haku-graph-node__title">
        {data.node.layout.label ?? data.node.type.slice(0, 8)}
      </div>
      <div className="haku-graph-node__ports">
        {data.node.callsites.map((callsite) => (
          <div
            key={callsite.id}
            className={`haku-graph-node__port haku-graph-node__port--${callsite.direction}`}
            title={callsite.kind === 'data' || callsite.kind === 'event'
              ? JSON.stringify(callsite.type)
              : callsite.kind}
          >
            <Handle
              id={callsite.id}
              type={callsite.direction === 'output' ? 'source' : 'target'}
              position={callsite.direction === 'output' ? Position.Right : Position.Left}
            />
            <span>{callsite.kind}</span>
            {Object.hasOwn(data.portValues, callsite.id) && (
              <output>{formatPortValue(data.portValues[callsite.id])}</output>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

const nodeTypes = { haku: HakuNode }

function formatPortValue(value: unknown): string {
  try {
    const json = JSON.stringify(value)
    return json.length > 32 ? `${json.slice(0, 29)}…` : json
  } catch {
    return String(value)
  }
}

function endpoint(
  connection: Pick<Edge | Connection, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>,
  side: 'source' | 'target',
) {
  const node = side === 'source' ? connection.source : connection.target
  const callsite = side === 'source' ? connection.sourceHandle : connection.targetHandle
  if (!node || !callsite) return null
  return { node, callsite }
}

export default function ReactFlowGraphCanvas({
  asset,
  selectedNodeIds,
  diagnostics,
  trace,
  portValues,
  onSelectNodes,
  onMoveNodes,
  onDeleteNodes,
  onDeleteConnections,
  canConnect,
  onConnect,
}: GraphCanvasProviderProps) {
  const selected = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const diagnosticNodes = useMemo(
    () => new Set(diagnostics.flatMap((item) => item.location.nodeId ?? [])),
    [diagnostics],
  )
  const activeNode = trace.at(-1)?.nodeId
  const modelNodes = useMemo<HakuFlowNode[]>(
    () => asset.graph.nodes.map((node) => ({
      id: node.id,
      type: 'haku',
      position: { x: node.layout.x, y: node.layout.y },
      initialWidth: 180,
      initialHeight: 48 + node.callsites.length * 22,
      handles: node.callsites.map((callsite, index) => {
        const source = callsite.direction === 'output'
        return {
          id: callsite.id,
          type: source ? 'source' : 'target',
          position: source ? Position.Right : Position.Left,
          x: source ? 176 : -4,
          y: 39 + index * 22,
          width: 8,
          height: 8,
        }
      }),
      selected: selected.has(node.id),
      data: {
        node,
        diagnostic: diagnosticNodes.has(node.id),
        active: node.id === activeNode,
        portValues,
      },
    })),
    [activeNode, asset.graph.nodes, diagnosticNodes, portValues, selected],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState<HakuFlowNode>(modelNodes)
  useEffect(() => setNodes(modelNodes), [modelNodes, setNodes])
  const edges = useMemo<Edge[]>(
    () => asset.graph.connections.map((connection) => ({
      id: connection.id,
      source: connection.from.node,
      sourceHandle: connection.from.callsite,
      target: connection.to.node,
      targetHandle: connection.to.callsite,
    })),
    [asset.graph.connections],
  )
  const isValidConnection = useCallback((connection: Edge | Connection) => {
    const from = endpoint(connection, 'source')
    const to = endpoint(connection, 'target')
    return !!from && !!to && canConnect(from, to)
  }, [canConnect])
  const handleConnect = useCallback((connection: Connection) => {
    const from = endpoint(connection, 'source')
    const to = endpoint(connection, 'target')
    if (from && to) onConnect(from, to)
  }, [onConnect])

  return (
    <ReactFlow<HakuFlowNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      fitView
      minZoom={0.15}
      maxZoom={2.5}
      multiSelectionKeyCode={['Meta', 'Control']}
      selectionKeyCode="Shift"
      isValidConnection={isValidConnection}
      onConnect={handleConnect}
      onNodeDragStop={(_, node) => {
        onMoveNodes([{ nodeId: node.id, x: node.position.x, y: node.position.y }])
      }}
      onSelectionChange={({ nodes: selectedNodes }) => {
        onSelectNodes(selectedNodes.map((node) => node.id))
      }}
      onNodesDelete={(deleted) => onDeleteNodes(deleted.map((node) => node.id))}
      onEdgesDelete={(deleted) => onDeleteConnections(deleted.map((edge) => edge.id))}
    >
      <Background color="#3b3b46" gap={20} />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  )
}
