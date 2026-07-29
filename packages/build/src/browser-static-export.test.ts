import { describe, expect, it } from "vitest";

import { createBrowserStaticExport } from "./index.js";

describe("createBrowserStaticExport", () => {
  it("emits root HTML and only transitively reachable local files with relative URLs", async () => {
    const result = await createBrowserStaticExport({
      entryHtmlPath: "index.html",
      files: [
        {
          path: "index.html",
          contents:
            '<!doctype html><script type="module" src="/src/main.ts"></script>',
        },
        {
          path: "src/main.ts",
          contents:
            'document.body.dataset.assetUrl = new URL("/assets/reachable.txt", import.meta.url).href;',
        },
        {
          path: "assets/reachable.txt",
          contents: "reachable",
        },
        {
          path: "assets/unreachable.txt",
          contents: "unreachable",
        },
      ],
    });

    expect([...result.files.keys()].sort()).toEqual([
      "assets/reachable.txt",
      "assets/runtime.js",
      "index.html",
    ]);
    expect(result.files.get("index.html")).toContain(
      '<script type="module" src="./assets/runtime.js"></script>',
    );
    expect(result.files.get("assets/runtime.js")).toContain(
      'new URL("./reachable.txt", import.meta.url)',
    );
    expect(result.files.get("assets/reachable.txt")).toBe("reachable");
  });
});
