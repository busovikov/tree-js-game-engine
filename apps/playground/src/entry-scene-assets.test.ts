import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface SceneComponent {
  type?: string;
  data?: {
    geometryType?: string;
    modelAsset?: string;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    followCamera?: boolean;
  };
}

interface SceneDocument {
  metadata?: { activeCameraId?: string };
  entities?: Array<{
    id?: string;
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

  it('aims the active camera at the playable area', () => {
    const playgroundRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const project = JSON.parse(
      readFileSync(resolve(playgroundRoot, 'haku.project.json'), 'utf8'),
    ) as { entryScene: string };
    const scene = JSON.parse(
      readFileSync(resolve(playgroundRoot, project.entryScene), 'utf8'),
    ) as SceneDocument;
    const camera = scene.entities?.find(
      (entity) => entity.id === scene.metadata?.activeCameraId,
    );
    const transform = camera?.components?.find(
      (component) => component.type === 'Transform',
    )?.data;
    const [px, py, pz] = transform?.position ?? [0, 0, 0];
    const [qx, qy, qz, qw] = transform?.rotation ?? [0, 0, 0, 1];

    const forward = [
      -2 * (qx * qz + qw * qy),
      -2 * (qy * qz - qw * qx),
      -(1 - 2 * (qx * qx + qy * qy)),
    ];
    const toPlayArea = [0 - px, 3 - py, 5 - pz];
    const length = Math.hypot(...toPlayArea);
    const alignment =
      (forward[0]! * toPlayArea[0]! +
        forward[1]! * toPlayArea[1]! +
        forward[2]! * toPlayArea[2]!) /
      length;

    expect(alignment).toBeGreaterThan(0.995);
    const controllers =
      scene.entities?.flatMap((entity) =>
        (entity.components ?? []).filter(
          (component) => component.type === 'PhysicsController',
        ),
      ) ?? [];
    expect(controllers.length).toBeGreaterThan(0);
    expect(controllers.every((component) => component.data?.followCamera === false)).toBe(
      true,
    );
  });
});
