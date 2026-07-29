import { describe, expect, it } from "vitest";

import { createBrowserStaticExportZip } from "./index.js";

function storedFileNames(zip: Uint8Array): string[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const names: string[] = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    names.push(decoder.decode(zip.subarray(nameStart, nameStart + nameLength)));
    offset = nameStart + nameLength + extraLength + compressedSize;
  }
  return names;
}

function centralUnixModes(zip: Uint8Array): number[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const endOffset = zip.byteLength - 22;
  let offset = view.getUint32(endOffset + 16, true);
  const modes: number[] = [];
  while (view.getUint32(offset, true) === 0x02014b50) {
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    modes.push(view.getUint32(offset + 38, true) >>> 16);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return modes;
}

describe("createBrowserStaticExportZip", () => {
  it("writes deterministic stored files with index.html at the ZIP root", () => {
    const first = createBrowserStaticExportZip(
      new Map([
        ["assets/runtime.js", "document.body.dataset.ready='yes'"],
        ["index.html", '<script type="module" src="./assets/runtime.js"></script>'],
        ["assets/data.bin", new Uint8Array([3, 1, 4])],
      ]),
    );
    const second = createBrowserStaticExportZip(
      new Map([
        ["assets/data.bin", new Uint8Array([3, 1, 4])],
        ["index.html", '<script type="module" src="./assets/runtime.js"></script>'],
        ["assets/runtime.js", "document.body.dataset.ready='yes'"],
      ]),
    );

    expect(storedFileNames(first)).toEqual([
      "index.html",
      "assets/data.bin",
      "assets/runtime.js",
    ]);
    expect(centralUnixModes(first)).toEqual([
      0o100644,
      0o100644,
      0o100644,
    ]);
    expect(first).toEqual(second);
  });

  it("rejects paths that could escape the extracted export root", () => {
    expect(() =>
      createBrowserStaticExportZip(new Map([["../outside.txt", "no"]])),
    ).toThrow("Unsafe ZIP path");
    expect(() =>
      createBrowserStaticExportZip(new Map([["/absolute.txt", "no"]])),
    ).toThrow("Unsafe ZIP path");
  });
});
