function normalizeSegments(path: string): string {
  const output: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (output.length === 0) throw new Error('Import escapes the project boundary')
      output.pop()
    } else {
      output.push(segment)
    }
  }
  return output.join('/')
}

function withTypeScriptExtension(path: string): string {
  if (path.endsWith('.js') || path.endsWith('.mjs')) {
    return path.replace(/\.m?js$/, '.ts')
  }
  return /\.[a-z0-9]+$/i.test(path) ? path : `${path}.ts`
}

export function resolveBrowserProjectImport(specifier: string, importer: string): string {
  if (/^(?:https?|data|blob):/i.test(specifier)) {
    throw new Error('Remote URL imports are not allowed')
  }
  if (specifier.startsWith('@haku/')) return specifier
  if (!specifier.startsWith('.')) {
    throw new Error(`Package import "${specifier}" is not available`)
  }

  const importerDirectory = importer.slice(0, Math.max(0, importer.lastIndexOf('/')))
  return withTypeScriptExtension(normalizeSegments(`${importerDirectory}/${specifier}`))
}
