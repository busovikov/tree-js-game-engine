import type { BrowserStaticExportContents } from './browser-static-export.js'

const ENCODER = new TextEncoder()
const UTF8_FLAG = 0x0800
const STORED_METHOD = 0
const DOS_EPOCH_DATE = 0x0021

const CRC32_TABLE = new Uint32Array(256)
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  CRC32_TABLE[index] = value >>> 0
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

function bytes(contents: BrowserStaticExportContents): Uint8Array {
  return typeof contents === 'string' ? ENCODER.encode(contents) : contents
}

function safeZipPath(path: string): string {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe ZIP path: ${path}`)
  }
  return path
}

function comparePaths(left: string, right: string): number {
  if (left === 'index.html') return right === 'index.html' ? 0 : -1
  if (right === 'index.html') return 1
  return left < right ? -1 : left > right ? 1 : 0
}

function concatenate(parts: readonly Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

interface ZipEntry {
  readonly path: string
  readonly pathBytes: Uint8Array
  readonly contents: Uint8Array
  readonly crc: number
  readonly localOffset: number
}

export function createBrowserStaticExportZip(
  files: ReadonlyMap<string, BrowserStaticExportContents>,
): Uint8Array {
  const sortedFiles = [...files.entries()]
    .map(([path, contents]) => [safeZipPath(path), contents] as const)
    .sort(([left], [right]) => comparePaths(left, right))
  if (!files.has('index.html')) {
    throw new Error('Static export ZIP requires index.html at its root.')
  }
  if (files.size > 0xffff) {
    throw new Error('Static export ZIP exceeds the ZIP32 file-count limit.')
  }

  const localParts: Uint8Array[] = []
  const entries: ZipEntry[] = []
  let localOffset = 0
  for (const [path, contentsInput] of sortedFiles) {
    const pathBytes = ENCODER.encode(path)
    const contents = bytes(contentsInput)
    if (pathBytes.byteLength > 0xffff || contents.byteLength > 0xffffffff) {
      throw new Error(`Static export ZIP entry exceeds ZIP32 limits: ${path}`)
    }

    const localHeader = new Uint8Array(30 + pathBytes.byteLength)
    const view = new DataView(localHeader.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, UTF8_FLAG, true)
    view.setUint16(8, STORED_METHOD, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, DOS_EPOCH_DATE, true)
    const checksum = crc32(contents)
    view.setUint32(14, checksum, true)
    view.setUint32(18, contents.byteLength, true)
    view.setUint32(22, contents.byteLength, true)
    view.setUint16(26, pathBytes.byteLength, true)
    view.setUint16(28, 0, true)
    localHeader.set(pathBytes, 30)
    localParts.push(localHeader, contents)
    entries.push({
      path,
      pathBytes,
      contents,
      crc: checksum,
      localOffset,
    })
    localOffset += localHeader.byteLength + contents.byteLength
  }

  const centralParts: Uint8Array[] = []
  let centralSize = 0
  for (const entry of entries) {
    const centralHeader = new Uint8Array(46 + entry.pathBytes.byteLength)
    const view = new DataView(centralHeader.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 0x0314, true)
    view.setUint16(6, 20, true)
    view.setUint16(8, UTF8_FLAG, true)
    view.setUint16(10, STORED_METHOD, true)
    view.setUint16(12, 0, true)
    view.setUint16(14, DOS_EPOCH_DATE, true)
    view.setUint32(16, entry.crc, true)
    view.setUint32(20, entry.contents.byteLength, true)
    view.setUint32(24, entry.contents.byteLength, true)
    view.setUint16(28, entry.pathBytes.byteLength, true)
    view.setUint16(30, 0, true)
    view.setUint16(32, 0, true)
    view.setUint16(34, 0, true)
    view.setUint16(36, 0, true)
    view.setUint32(38, (0o100644 << 16) >>> 0, true)
    view.setUint32(42, entry.localOffset, true)
    centralHeader.set(entry.pathBytes, 46)
    centralParts.push(centralHeader)
    centralSize += centralHeader.byteLength
  }

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, localOffset, true)
  endView.setUint16(20, 0, true)

  return concatenate(
    [...localParts, ...centralParts, end],
    localOffset + centralSize + end.byteLength,
  )
}
