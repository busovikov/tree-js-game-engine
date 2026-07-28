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
    readonly fields?: readonly {
      readonly name: string
      readonly type: string
      readonly optional?: boolean
    }[]
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

function componentFieldType(type: string): string {
  if (type === 'number') return 'number'
  if (type === 'string') return 'string'
  if (type === 'boolean') return 'boolean'
  if (type === 'vec2') return 'readonly [number, number]'
  if (type === 'vec3') return 'readonly [number, number, number]'
  if (type === 'color') {
    return 'readonly [number, number, number, number]'
  }
  if (type === 'entity-ref') {
    return "{ readonly $ref: `entity:${string}` }"
  }
  if (type === 'asset-ref') {
    return '{ readonly $ref: string; readonly type?: string }'
  }
  if (type === 'component-ref') {
    return '{ readonly entity: { readonly $ref: `entity:${string}` }; readonly component: ComponentId }'
  }
  return 'unknown'
}

function componentDataDeclarations(
  components: BrowserProjectIndexInput['components'],
): string {
  const definitions = [...components]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((component) => {
      const fields = [...(component.fields ?? [])]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(
          (field) =>
            `    readonly ${JSON.stringify(field.name)}${field.optional ? '?' : ''}: ${componentFieldType(field.type)}`,
        )
        .join('\n')
      return `  readonly ${JSON.stringify(component.id)}: {\n${fields}\n  }`
    })
    .join('\n')
  return `  export interface ComponentDataById {\n${definitions}\n  }\n  export type ComponentData<T extends ComponentId> = ComponentDataById[T]\n`
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
${componentDataDeclarations(input.components)}\
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
