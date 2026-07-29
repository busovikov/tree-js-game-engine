import { describe, expect, it, vi } from "vitest";

import {
  buildDiagnosticNavigationTarget,
  navigateToBuildDiagnostic,
  subscribeBuildDiagnosticNavigation,
} from "./build-diagnostic-navigation.js";

describe("build diagnostic navigation", () => {
  it("routes graph, type, code, and UI source locations to authoring workspaces", () => {
    expect(
      buildDiagnosticNavigationTarget({
        kind: "graph",
        path: "public/assets/graphs/game.graph.json",
        graphId: "graph-1",
        nodeId: "node-2",
      }),
    ).toEqual({
      workspace: "graph",
      path: "public/assets/graphs/game.graph.json",
      selectionId: "node-2",
    });
    expect(
      buildDiagnosticNavigationTarget({
        kind: "type",
        path: "public/assets/types/player.component.json",
        typeId: "type-1",
      }),
    ).toEqual({
      workspace: "code",
      path: "public/assets/types/player.component.json",
      selectionId: "type-1",
    });
    expect(
      buildDiagnosticNavigationTarget({
        kind: "code",
        path: "src/main.ts",
        line: 7,
        column: 4,
      }),
    ).toEqual({
      workspace: "code",
      path: "src/main.ts",
      line: 7,
      column: 4,
    });
    expect(
      buildDiagnosticNavigationTarget({
        kind: "ui",
        path: "public/assets/ui/hud.ui.json",
        uiDocumentId: "ui-1",
        uiElementId: "button-2",
      }),
    ).toEqual({
      workspace: "ui",
      path: "public/assets/ui/hud.ui.json",
      selectionId: "button-2",
    });
  });

  it("replays the latest navigation to a workspace that mounts after the click", () => {
    navigateToBuildDiagnostic({
      kind: "code",
      path: "src/main.ts",
      line: 3,
      column: 2,
    });
    const listener = vi.fn();

    const unsubscribe = subscribeBuildDiagnosticNavigation(listener);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: "code", path: "src/main.ts" }),
    );
    unsubscribe();
  });
});
