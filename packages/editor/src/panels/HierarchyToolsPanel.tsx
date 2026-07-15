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

function ColliderIcon() {
  return (
    <ToolIcon>
      <path d="M5 8h14v8H5V8Z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 8V5h8v3M8 16v3h8v-3M5 11H2M22 11h-3M5 13H2M22 13h-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </ToolIcon>
  )
}

function PhysicsDebugIcon() {
  return (
    <ToolIcon>
      <path d="M4 18h16M6 14l3-8 3 5 2-3 4 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </ToolIcon>
  )
}

function PlanetSpaceIcon({ space }: { space: 'local' | 'world' }) {
  return (
    <ToolIcon>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="7" ry="2.8" stroke="currentColor" strokeWidth="1.25" opacity="0.85" />
      <path d="M12 5v14" stroke="currentColor" strokeWidth="1.25" opacity="0.85" />
      {space === 'local' ? (
        <>
          <path d="M5.5 16.5l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M5.5 16.5v-3.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      )}
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
  const showAllColliders = useEditorStore((s) => s.showAllColliders)
  const setShowAllColliders = useEditorStore((s) => s.setShowAllColliders)
  const showPhysicsDebug = useEditorStore((s) => s.showPhysicsDebug)
  const setShowPhysicsDebug = useEditorStore((s) => s.setShowPhysicsDebug)
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
  const canPhysicsDebug = !!world && mode === 'play'

  const tools: Array<{ tool: TransformTool; title: string; icon: ReactNode }> = [
    { tool: 'translate', title: formatToolTitle('Move', TRANSFORM_TOOL_SHORTCUT.translate), icon: <MoveIcon /> },
    { tool: 'rotate', title: formatToolTitle('Rotate', TRANSFORM_TOOL_SHORTCUT.rotate), icon: <RotateIcon /> },
    { tool: 'scale', title: formatToolTitle('Scale', TRANSFORM_TOOL_SHORTCUT.scale), icon: <ScaleIcon /> },
  ]

  return (
    <div className="haku-hierarchy-tools" aria-label="Object tools">
      <div className="haku-hierarchy-tools__space">
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
          <PlanetSpaceIcon space={gizmoSpace} />
        </ToolButton>
      </div>

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
        title="Show collider wireframes for all entities in the scene."
        active={showAllColliders}
        disabled={!canEdit}
        onClick={() => setShowAllColliders(!showAllColliders)}
      >
        <ColliderIcon />
      </ToolButton>

      <ToolButton
        title="Show directional shadow map orthographic volume (debug)."
        active={showShadowVolume}
        disabled={!canEdit}
        onClick={() => setShowShadowVolume(!showShadowVolume)}
      >
        <ShadowVolumeIcon />
      </ToolButton>

      <ToolButton
        title="Show Rapier physics debug lines (play mode)."
        active={showPhysicsDebug}
        disabled={!canPhysicsDebug}
        onClick={() => setShowPhysicsDebug(!showPhysicsDebug)}
      >
        <PhysicsDebugIcon />
      </ToolButton>
    </div>
  )
})
