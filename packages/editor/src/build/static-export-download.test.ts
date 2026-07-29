// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { downloadStaticExportZip } from "./static-export-download.js";

describe("downloadStaticExportZip", () => {
  it("clicks a same-page Blob download and revokes the object URL", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = { href: "", download: "", click, remove };
    const createObjectURL = vi.fn(() => "blob:haku-static-export");
    const revokeObjectURL = vi.fn();
    const defer = vi.fn((callback: () => void) => callback());

    downloadStaticExportZip(new Uint8Array([1, 2, 3]), "game.zip", {
      createAnchor: () => anchor,
      createObjectURL,
      revokeObjectURL,
      defer,
    });

    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: "application/zip" }),
    );
    expect(anchor.href).toBe("blob:haku-static-export");
    expect(anchor.download).toBe("game.zip");
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:haku-static-export");
  });
});
