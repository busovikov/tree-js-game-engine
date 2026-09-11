import {
  generateBrowserProjectTooling,
  type BrowserProjectTooling,
} from '@haku/build'
import {
  FOUNDATION_NODE_SDK_DECLARATIONS,
  GRAPH_ASSET_TYPE,
} from '@haku/graph'
import { memo, useEffect, useState } from 'react'
import { projectService, type ProjectService } from '../services/project-service.js'
import { useEditorStore } from '../store/editor-store.js'
import type { BrowserProjectWorkspace } from '../services/browser-project-workspace.js'
import { CodeWorkspacePanel } from './CodeWorkspacePanel.js'

const ENGINE_DECLARATIONS = `export {}

declare module '@haku/engine' {
  export interface HakuGameplayRuntime {
    readonly projectId: string
  }
}
`

export function createProjectBrowserTooling(service: ProjectService): BrowserProjectTooling {
  const manifest = service.getManifest()
  return generateBrowserProjectTooling({
    engineDeclarations: ENGINE_DECLARATIONS,
    nodeSdkDeclarations: FOUNDATION_NODE_SDK_DECLARATIONS,
    assets:
      manifest?.assets.map((asset) => ({
        id: asset.id,
        path: asset.path,
        type: asset.type,
      })) ?? [],
    components: service.getCustomComponentTypes().map((component) => ({
      id: component.id,
      name: component.name,
      fields:
        component.inspector?.fields.map((field) => ({
          name: field.name,
          type: field.type,
          optional: field.optional,
        })) ?? [],
    })),
    graphs:
      manifest?.assets
        .filter((asset) => asset.type === GRAPH_ASSET_TYPE)
        .map((asset) => ({
          id: asset.id,
          name:
            typeof asset.metadata?.name === 'string'
              ? asset.metadata.name
              : asset.path,
        })) ?? [],
  })
}

export interface ProjectCodeWorkspacePanelProps {
  readonly service?: ProjectService
}

export const ProjectCodeWorkspacePanel = memo(function ProjectCodeWorkspacePanel({
  service = projectService,
}: ProjectCodeWorkspacePanelProps) {
  const projectRoot = useEditorStore((state) => state.projectRoot)
  const setProjectRoot = useEditorStore((state) => state.setProjectRoot)
  const [workspace, setWorkspace] = useState<BrowserProjectWorkspace | null>(null)
  const [tooling, setTooling] = useState<BrowserProjectTooling | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!projectRoot || !service.getManifest()) {
      setWorkspace(null)
      setTooling(null)
      setError(null)
      return
    }
    const nextTooling = createProjectBrowserTooling(service)
    setTooling(nextTooling)
    setError(null)
    void service
      .openCodeWorkspace({ generatedFiles: nextTooling.files })
      .then((nextWorkspace) => {
        if (!cancelled) setWorkspace(nextWorkspace)
      })
      .catch((reason) => {
        if (!cancelled) {
          setWorkspace(null)
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectRoot, service])

  if (!projectRoot) {
    return <div className="haku-code-workspace__empty">Open a project to use Code.</div>
  }
  if (error) {
    return (
      <div className="haku-code-workspace__diagnostic" role="alert">
        {error}
      </div>
    )
  }
  if (!workspace || !tooling) {
    return <div className="haku-code-workspace__empty">Preparing local TypeScript tools…</div>
  }
  return (
    <CodeWorkspacePanel
      workspace={workspace}
      tooling={tooling}
      forkWorkspace={async () => {
        const forked = await service.forkBuiltInCodeWorkspaceToDisk()
        setProjectRoot(forked.projectId)
        return forked
      }}
    />
  )
})
