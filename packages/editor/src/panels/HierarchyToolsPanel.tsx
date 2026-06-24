import { memo, type ReactNode } from 'react'
import { useEditorStore, type TransformTool } from '../store/editor-store.js'
import {
  FOCUS_SELECTION_SHORTCUT,
  GIZMO_SPACE_SHORTCUT,
  TRANSFORM_TOOL_SHORTCUT,
  formatToolTitle,
} from '../viewport/transform-tool-shortcuts.js'

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  )
}

function FocusIcon() {
  return (
    <ToolIcon>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </ToolIcon>
  )
}

function MoveIcon() {
  return (
    <ToolIcon>
      <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </ToolIcon>
  )
}

function RotateIcon() {
  return (
    <ToolIcon>
      <path d="M18 6A8 8 0 1 0 20 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M20 4v4h-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </ToolIcon>
  )
}

function ScaleIcon() {
  return (
    <ToolIcon>
      <path d="M4 20L20 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M14 4h6v6M4 14v6h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </ToolIcon>
  )
}

function HandIcon() {
  return (
    <ToolIcon>
      <path
        d="M7 11V7a1.5 1.5 0 1 1 3 0v4M10 11V6.5a1.5 1.5 0 1 1 3 0V11M13 11V7.5a1.5 1.5 0 1 1 3 0v6.5a5 5 0 0 1-5 5h-1a4 4 0 0 1-4-4v-3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </ToolIcon>
  )
}

function SnapIcon() {
  return (
    <ToolIcon>
      <path
        d="M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM17 14v3M20 17h-3M17 20v-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </ToolIcon>
  )
}

function ShadowVolumeIcon() {
  return (
    <ToolIcon>
      <path d="M4 18L12 6l8 12H4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M8 14h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeDasharray="2 2" />
    </ToolIcon>
  )
}

function AabbIcon() {
  return (
    <ToolIcon>
      <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 7l4-3h8l4 3M8 4v3M16 4v3M20 10v7M4 10v7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </ToolIcon>
  )
}

function LocalSpaceIcon() {
  return (
    <ToolIcon>
      <rect x="8" y="8" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.75" transform="rotate(20 12 12)" />
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" transform="rotate(20 12 12)" />
    </ToolIcon>
  )
}

function WorldSpaceIcon() {
  return (
    <ToolIcon>
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.75" />
    </ToolIcon>
  )
}

function ToolButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`haku-hierarchy-tool${active ? ' haku-hierarchy-tool--active' : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export const HierarchyToolsPanel = memo(function HierarchyToolsPanel() {
  const mode = useEditorStore((s) => s.mode)
  const selection = useEditorStore((s) => s.selection)
  const showAabb = useEditorStore((s) => s.showAabb)
  const setShowAabb = useEditorStore((s) => s.setShowAabb)
  const showShadowVolume = useEditorStore((s) => s.showShadowVolume)
  const setShowShadowVolume = useEditorStore((s) => s.setShowShadowVolume)
  const world = useEditorStore((s) => s.world)
  const activeViewportTab = useEditorStore((s) => s.activeViewportTab)
  const transformTool = useEditorStore((s) => s.transformTool)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const gizmoSpace = useEditorStore((s) => s.gizmoSpace)
  const setTransformTool = useEditorStore((s) => s.setTransformTool)
  const setSnapEnabled = useEditorStore((s) => s.setSnapEnabled)
  const setGizmoSpace = useEditorStore((s) => s.setGizmoSpace)
  const requestFocusSelection = useEditorStore((s) => s.requestFocusSelection)

  const canEdit = !!world && mode === 'edit'
  const canPan = !!world && mode === 'edit' && activeViewportTab === 'scene'

  const tools: Array<{ tool: TransformTool; title: string; icon: ReactNode }> = [
    { tool: 'translate', title: formatToolTitle('Move', TRANSFORM_TOOL_SHORTCUT.translate), icon: <MoveIcon /> },
    { tool: 'rotate', title: formatToolTitle('Rotate', TRANSFORM_TOOL_SHORTCUT.rotate), icon: <RotateIcon /> },
    { tool: 'scale', title: formatToolTitle('Scale', TRANSFORM_TOOL_SHORTCUT.scale), icon: <ScaleIcon /> },
  ]

  return (
    <div className="haku-hierarchy-tools" aria-label="Object tools">
      <ToolButton
        title={formatToolTitle('Focus selection', FOCUS_SELECTION_SHORTCUT)}
        disabled={!canEdit || selection.length === 0}
        onClick={requestFocusSelection}
      >
        <FocusIcon />
      </ToolButton>

      <ToolButton
        title={formatToolTitle('Hand (pan camera)', TRANSFORM_TOOL_SHORTCUT.hand)}
        active={transformTool === 'hand'}
        disabled={!canPan}
        onClick={() => setTransformTool('hand')}
      >
        <HandIcon />
      </ToolButton>

      {tools.map(({ tool, title, icon }) => (
        <ToolButton
          key={tool}
          title={title}
          active={transformTool === tool}
          disabled={!canEdit}
          onClick={() => setTransformTool(tool)}
        >
          {icon}
        </ToolButton>
      ))}

      <ToolButton
        title={
          gizmoSpace === 'local'
            ? `${formatToolTitle('Local space', GIZMO_SPACE_SHORTCUT)} — gizmo axes follow each object's rotation. Click for global (world) space.`
            : `${formatToolTitle('Global (world) space', GIZMO_SPACE_SHORTCUT)} — gizmo axes stay aligned to world X/Y/Z. Click for local space.`
        }
        active={gizmoSpace === 'world'}
        disabled={!canEdit}
        onClick={() => setGizmoSpace(gizmoSpace === 'local' ? 'world' : 'local')}
      >
        {gizmoSpace === 'local' ? <LocalSpaceIcon /> : <WorldSpaceIcon />}
      </ToolButton>

      <ToolButton
        title="Snap selected objects to nearby AABB edges while translating."
        active={snapEnabled}
        disabled={!canEdit}
        onClick={() => setSnapEnabled(!snapEnabled)}
      >
        <SnapIcon />
      </ToolButton>

      <ToolButton
        title="Show axis-aligned bounding boxes for mesh entities."
        active={showAabb}
        disabled={!canEdit}
        onClick={() => setShowAabb(!showAabb)}
      >
        <AabbIcon />
      </ToolButton>

      <ToolButton
        title="Show directional shadow map orthographic volume (debug)."
        active={showShadowVolume}
        disabled={!canEdit}
        onClick={() => setShowShadowVolume(!showShadowVolume)}
      >
        <ShadowVolumeIcon />
      </ToolButton>
    </div>
  )
})
