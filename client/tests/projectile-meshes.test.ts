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
  cloneAnimatedModel,
  applyCartoonColorCorrection,
  registerModelForTest,
  clearModelsForTest,
} from '../src/render/modelBank';
import { createBrawlerMesh } from '../src/render/brawlerMeshes';

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

  it('has all 23 Blender GLB models present in client/public/models and isolates cloned materials when requested', () => {
    const keys = Object.keys(MODEL_MANIFEST) as ModelKey[];
    expect(keys).toHaveLength(23);
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

    // Verify balanced cartoon gamma (~1.45) deepens pastel midtones without crushing darks
    const testGrp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.2 });
    mat.color.setRGB(0.5, 0.5, 0.5);
    testGrp.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
    applyCartoonColorCorrection(testGrp);
    expect(mat.color.r).toBeGreaterThan(0.30);
    expect(mat.color.r).toBeLessThan(0.42);
    expect(mat.metalness).toBeLessThanOrEqual(0.28);

    // Verify rigged GLB animations wire cleanly into BrawlerVisual
    const rigProto = new THREE.Group();
    rigProto.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const idleClip = new THREE.AnimationClip('Idle', 1.0, []);
    const runClip = new THREE.AnimationClip('Run', 0.8, []);
    const atkClip = new THREE.AnimationClip('Attack', 0.4, []);
    registerModelForTest('buck', rigProto, [idleClip, runClip, atkClip]);

    const clonedRig = cloneAnimatedModel('buck', true)!;
    expect(clonedRig.animations).toHaveLength(3);
    const visual = createBrawlerMesh('buck', 'blue', true);
    expect(visual.hasAnimations).toBe(true);
    visual.updateAnimation(0.016, true, false);
    visual.updateAnimation(0.016, true, true);
    clearModelsForTest();
  });
});
