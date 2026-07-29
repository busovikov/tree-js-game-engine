import { describe, expect, it, vi } from "vitest";
import {
  BINARY_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  assetId,
  assetRef,
  type ProjectManifest,
} from "@haku/assets";

import {
  exportProjectAsStaticZip,
  type StaticExportProjectService,
} from "./project-static-export.js";

function manifest(): ProjectManifest {
  const sceneId = assetId("10000000-0000-4000-8000-000000000201");
  const reachableId = assetId("10000000-0000-4000-8000-000000000202");
  const unusedId = assetId("10000000-0000-4000-8000-000000000203");
  return {
    schemaVersion: 1,
    name: "Local Fixture",
    entryScene: assetRef(sceneId, SCENE_ASSET_TYPE),
    assetsDir: "public/assets",
    scriptsDir: "src",
    assets: [
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
      {
        id: unusedId,
        type: BINARY_ASSET_TYPE,
        path: "unused.bin",
        dependencies: [],
        metadata: {},
      },
    ],
  };
}

function service(trustMode: "local-trusted" | "imported-untrusted") {
  const reads = vi.fn(async (path: string) => new Uint8Array([path.length]));
  const workspace = {
    listFiles: () => [
      "index.html",
      "src/main.ts",
      "public/assets/main.scene.json",
      "public/assets/reachable.bin",
      "public/assets/unused.bin",
    ],
    readText: (path: string) =>
      path === "index.html"
        ? '<script type="module" src="./src/main.ts"></script>'
        : "document.body.dataset.ready = 'yes'",
  };
  const value: StaticExportProjectService = {
    getRoot: () => "local-fixture",
    getManifest: () => manifest(),
    getTrustMode: () => trustMode,
    getCodeWorkspace: () => workspace,
    openCodeWorkspace: async () => workspace,
    readProjectFile: reads,
  };
  return { value, reads };
}

describe("exportProjectAsStaticZip", () => {
  it("exports only reachable project assets and downloads a local ZIP", async () => {
    const project = service("local-trusted");
    const exportClient = {
      export: vi.fn(async (request) => ({
        ok: true as const,
        files: new Map([
          ["index.html", request.files[0]!.contents],
          ["assets/runtime.js", "document.body.dataset.ready='yes'"],
        ]),
        diagnostics: [] as const,
      })),
      dispose: vi.fn(),
    };
    const download = vi.fn();

    const result = await exportProjectAsStaticZip(project.value, {
      exportClient,
      download,
    });

    expect(result.ok).toBe(true);
    expect(project.reads.mock.calls.map(([path]) => path)).toEqual([
      "public/assets/reachable.bin",
      "public/assets/main.scene.json",
    ]);
    expect(exportClient.export).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.arrayContaining([
          expect.objectContaining({ path: "index.html" }),
          expect.objectContaining({ path: "src/main.ts" }),
          expect.objectContaining({ path: "public/assets/reachable.bin" }),
          expect.objectContaining({ path: "public/assets/main.scene.json" }),
        ]),
      }),
    );
    expect(download).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "local-fixture.zip",
    );
    expect(exportClient.dispose).toHaveBeenCalledOnce();
  });

  it("does not invoke workers or download for imported-untrusted projects", async () => {
    const project = service("imported-untrusted");
    const exportClient = {
      export: vi.fn(),
      dispose: vi.fn(),
    };
    const download = vi.fn();

    const result = await exportProjectAsStaticZip(project.value, {
      exportClient,
      download,
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: "trust.untrusted-code" }),
      ],
    });
    expect(project.reads).not.toHaveBeenCalled();
    expect(exportClient.export).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
});
