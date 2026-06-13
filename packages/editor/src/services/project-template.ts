export const HAKU_TEMPLATE_PATHS = [
  'haku.project.json',
  'package.json',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.base.json',
  '.gitignore',
  'src/main.ts',
  'scripts/player.ts',
  'public/assets/scenes/menu.scene.json',
] as const

export async function fetchProjectTemplateFiles(baseUrl = '/haku-templates'): Promise<Map<string, string>> {
  const files = new Map<string, string>()

  for (const path of HAKU_TEMPLATE_PATHS) {
    const res = await fetch(`${baseUrl}/${path}`)
    if (!res.ok) throw new Error(`Failed to load project template file: ${path}`)
    files.set(path, await res.text())
  }

  return files
}

export function personalizeProjectTemplate(files: Map<string, string>, projectName: string): Map<string, string> {
  const next = new Map(files)

  const manifestRaw = next.get('haku.project.json')
  if (manifestRaw) {
    const manifest = JSON.parse(manifestRaw) as { name: string }
    manifest.name = projectName
    next.set('haku.project.json', `${JSON.stringify(manifest, null, 2)}\n`)
  }

  const packageRaw = next.get('package.json')
  if (packageRaw) {
    const pkg = JSON.parse(packageRaw) as { name: string }
    pkg.name = projectName
    next.set('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
  }

  const html = next.get('index.html')
  if (html) {
    next.set('index.html', html.replace('<title>my-game</title>', `<title>${projectName}</title>`))
  }

  return next
}

export async function loadPersonalizedProjectTemplate(
  projectName: string,
  baseUrl = '/haku-templates',
): Promise<Map<string, string>> {
  return personalizeProjectTemplate(await fetchProjectTemplateFiles(baseUrl), projectName)
}
