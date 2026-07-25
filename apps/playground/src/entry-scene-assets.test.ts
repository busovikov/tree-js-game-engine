import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface SceneComponent {
  type?: string;
  data?: {
    geometryType?: string;
    modelAsset?: string;
  };
}

interface SceneDocument {
  entities?: Array<{
    name?: string;
    components?: SceneComponent[];
  }>;
}

describe('playground entry scene', () => {
  it('does not reference missing model assets', () => {
    const playgroundRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const project = JSON.parse(
      readFileSync(resolve(playgroundRoot, 'haku.project.json'), 'utf8'),
    ) as { entryScene: string };
    const scenePath = resolve(playgroundRoot, project.entryScene);
    const scene = JSON.parse(readFileSync(scenePath, 'utf8')) as SceneDocument;

    const missingAssets =
      scene.entities?.flatMap((entity) =>
        (entity.components ?? [])
          .filter(
            (component) =>
              component.type === 'MeshRenderer' &&
              component.data?.geometryType === 'ModelGeometry' &&
              component.data.modelAsset,
          )
          .filter(
            (component) =>
              !existsSync(
                resolve(
                  playgroundRoot,
                  'public/assets',
                  component.data?.modelAsset ?? '',
                ),
              ),
          )
          .map(
            (component) =>
              `${entity.name ?? 'Unnamed entity'}: ${component.data?.modelAsset}`,
          ),
      ) ?? [];

    expect(missingAssets).toEqual([]);
  });
});
