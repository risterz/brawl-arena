import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { BRAWLER_LIST } from '@brawl-arena/shared';
import {
  createProjectileVisual,
  createBombVisual,
  createGemCrystalVisual,
  createFlameGeometry,
  createHealCrossGeometry,
} from '../src/render/projectileMeshes';
import {
  MODEL_MANIFEST,
  ModelKey,
  cloneModel,
  registerModelForTest,
  clearModelsForTest,
} from '../src/render/modelBank';

describe('Sculpted 3D projectile, bomb, crystal, flame, and heal meshes', () => {
  it('builds distinct multi-part sculpted visuals (not plain spheres) for every brawler primary and Super', () => {
    for (const b of BRAWLER_LIST) {
      for (const isSuper of [false, true]) {
        const visual = createProjectileVisual({
          brawlerId: b.id,
          team: 'blue',
          isSuper,
          isHeal: b.id === 'lumi' && isSuper,
          radius: 0.25,
        });
        expect(visual).toBeInstanceOf(THREE.Group);
        expect(visual.children.length).toBeGreaterThanOrEqual(2);
        expect(visual.name).toContain(b.id);
      }
    }
  });

  it('builds a cartoon iron bomb with fuse and flame tip, a faceted gem crystal, a teardrop flame, and a 3D heal cross', () => {
    const bomb = createBombVisual();
    expect(bomb).toBeInstanceOf(THREE.Group);
    expect(bomb.getObjectByName('bomb-fuse')).toBeDefined();
    expect(bomb.getObjectByName('bomb-flame')).toBeDefined();

    const gem = createGemCrystalVisual();
    expect(gem).toBeInstanceOf(THREE.Group);
    expect(gem.children.length).toBeGreaterThanOrEqual(2);

    const flameGeo = createFlameGeometry();
    expect(flameGeo.attributes.position.count).toBeGreaterThan(20);

    const crossGeo = createHealCrossGeometry();
    expect(crossGeo.attributes.position.count).toBeGreaterThan(20);
  });

  it('has all 18 Blender GLB models present in client/public/models and isolates cloned materials when requested', () => {
    const keys = Object.keys(MODEL_MANIFEST) as ModelKey[];
    expect(keys).toHaveLength(18);
    const modelsDir = path.resolve(__dirname, '../public/models');
    for (const k of keys) {
      const rel = MODEL_MANIFEST[k].replace(/^\/models\//, '');
      const fullPath = path.join(modelsDir, rel);
      expect(fs.existsSync(fullPath), `Missing GLB: ${fullPath}`).toBe(true);
      expect(fs.statSync(fullPath).size).toBeGreaterThan(1000);
    }

    clearModelsForTest();
    const proto = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    proto.add(mesh);
    registerModelForTest('buck', proto);

    const c1 = cloneModel('buck', true)!;
    const c2 = cloneModel('buck', true)!;
    expect(c1).not.toBeNull();
    expect((c1.children[0] as THREE.Mesh).material).not.toBe((c2.children[0] as THREE.Mesh).material);
    clearModelsForTest();
  });
});
