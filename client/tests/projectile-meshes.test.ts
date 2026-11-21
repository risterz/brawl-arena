import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BRAWLER_LIST } from '@brawl-arena/shared';
import {
  createProjectileVisual,
  createBombVisual,
  createGemCrystalVisual,
  createFlameGeometry,
  createHealCrossGeometry,
} from '../src/render/projectileMeshes';

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
});
