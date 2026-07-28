export interface BrowserProjectIndexInput {
  readonly engineDeclarations: string
  readonly nodeSdkDeclarations: string
  readonly assets: readonly {
    readonly id: string
    readonly path: string
    readonly type: string
  }[]
  readonly components: readonly {
    readonly id: string
    readonly name: string
  }[]
  readonly graphs: readonly {
    readonly id: string
    readonly name: string
  }[]
}

export interface BrowserProjectTooling {
  readonly files: Readonly<Record<string, string>>
  readonly monacoFiles: Readonly<Record<string, string>>
  readonly vsCodeFiles: Readonly<Record<string, string>>
}

function stringUnion(values: readonly string[]): string {
  const unique = [...new Set(values)].sort()
  return unique.length === 0 ? 'never' : unique.map((value) => JSON.stringify(value)).join(' | ')
}

export function generateBrowserProjectTooling(
  input: BrowserProjectIndexInput,
): BrowserProjectTooling {
  const tsconfig = `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['src/**/*.ts', '.haku/generated/**/*.d.ts'],
    },
    null,
    2,
  )}\n`

  const projectDeclarations = `declare module '@haku/project' {
  export type AssetId = ${stringUnion(input.assets.map((asset) => asset.id))}
  export type AssetPath = ${stringUnion(input.assets.map((asset) => asset.path))}
  export type ComponentId = ${stringUnion(input.components.map((component) => component.id))}
  export type ComponentName = ${stringUnion(input.components.map((component) => component.name))}
  export type GraphId = ${stringUnion(input.graphs.map((graph) => graph.id))}
  export type GraphName = ${stringUnion(input.graphs.map((graph) => graph.name))}
}
`

  const files = Object.freeze({
    'tsconfig.json': tsconfig,
    '.haku/generated/engine.d.ts': `${input.engineDeclarations.trim()}\n`,
    '.haku/generated/node-sdk.d.ts': `${input.nodeSdkDeclarations.trim()}\n`,
    '.haku/generated/project.d.ts': projectDeclarations,
  })
  return {
    files,
    monacoFiles: files,
    vsCodeFiles: files,
  }
}
