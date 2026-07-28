export type ExternalWindowOpener = (
  url?: string | URL,
  target?: string,
  features?: string,
) => Window | null

export function openProjectInExternalVsCode(
  absoluteProjectPath: string,
  open: ExternalWindowOpener = window.open.bind(window),
): string {
  if (!absoluteProjectPath.startsWith('/')) {
    throw new Error('An absolute project path is required to open external VS Code.')
  }
  const url = `vscode://file${encodeURI(absoluteProjectPath)}`
  open(url, '_blank', 'noopener,noreferrer')
  return url
}
