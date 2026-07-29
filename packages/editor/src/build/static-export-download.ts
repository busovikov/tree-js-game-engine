export interface StaticExportDownloadAnchor {
  href: string
  download: string
  click(): void
  remove(): void
}

export interface StaticExportDownloadEnvironment {
  createAnchor(): StaticExportDownloadAnchor
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  defer(callback: () => void): void
}

function browserDownloadEnvironment(): StaticExportDownloadEnvironment {
  return {
    createAnchor: () => document.createElement('a'),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    defer: (callback) => {
      window.setTimeout(callback, 0)
    },
  }
}

export function downloadStaticExportZip(
  bytes: Uint8Array,
  fileName: string,
  environment: StaticExportDownloadEnvironment = browserDownloadEnvironment(),
): void {
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' })
  const url = environment.createObjectURL(blob)
  const anchor = environment.createAnchor()
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  anchor.remove()
  environment.defer(() => environment.revokeObjectURL(url))
}
