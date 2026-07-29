import { describe, expect, it } from "vitest";
import {
  BINARY_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  assetId,
  assetRef,
  type ProjectManifest,
} from "@haku/assets";

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

  it("adds the deterministic manifest dependency closure and strips the public prefix", async () => {
    const sceneId = assetId("10000000-0000-4000-8000-000000000101");
    const reachableId = assetId("10000000-0000-4000-8000-000000000102");
    const unreachableId = assetId("10000000-0000-4000-8000-000000000103");
    const manifest: ProjectManifest = {
      schemaVersion: 1,
      name: "Static export fixture",
      entryScene: assetRef(sceneId, SCENE_ASSET_TYPE),
      assetsDir: "public/assets",
      scriptsDir: "src",
      assets: [
        {
          id: unreachableId,
          type: BINARY_ASSET_TYPE,
          path: "unused.bin",
          dependencies: [],
          metadata: {},
        },
        {
          id: sceneId,
          type: SCENE_ASSET_TYPE,
          path: "main.scene.json",
          dependencies: [assetRef(reachableId, BINARY_ASSET_TYPE)],
          metadata: {},
        },
        {
          id: reachableId,
          type: BINARY_ASSET_TYPE,
          path: "reachable.bin",
          dependencies: [],
          metadata: {},
        },
      ],
    };

    const result = await createBrowserStaticExport({
      entryHtmlPath: "index.html",
      manifest,
      files: [
        {
          path: "index.html",
          contents: '<script type="module" src="./src/main.ts"></script>',
        },
        {
          path: "src/main.ts",
          contents:
            "document.body.dataset.asset = new URL('/assets/reachable.bin', import.meta.url).href;",
        },
        { path: "public/assets/main.scene.json", contents: "{}" },
        { path: "public/assets/reachable.bin", contents: new Uint8Array([1, 2, 3]) },
        { path: "public/assets/unused.bin", contents: new Uint8Array([4, 5, 6]) },
      ],
    });

    expect([...result.files.keys()]).toEqual([
      "index.html",
      "assets/runtime.js",
      "assets/reachable.bin",
      "assets/main.scene.json",
    ]);
    expect(result.files.get("assets/runtime.js")).toContain(
      "new URL('./reachable.bin', import.meta.url)",
    );
  });

  it("rejects remote entry URLs and missing reachable files", async () => {
    await expect(
      createBrowserStaticExport({
        entryHtmlPath: "index.html",
        files: [
          {
            path: "index.html",
            contents:
              '<script type="module" src="https://cdn.example/game.js"></script>',
          },
        ],
      }),
    ).rejects.toThrow("Remote URL is not allowed");

    await expect(
      createBrowserStaticExport({
        entryHtmlPath: "index.html",
        files: [
          {
            path: "index.html",
            contents: '<script type="module" src="./src/main.ts"></script>',
          },
          {
            path: "src/main.ts",
            contents:
              'new URL("../assets/missing.bin", import.meta.url);',
          },
        ],
      }),
    ).rejects.toThrow("Static export file not found: assets/missing.bin");
  });
});
