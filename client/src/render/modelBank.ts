import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ModelKey =
  | 'buck'
  | 'vex'
  | 'blaze'
  | 'golem'
  | 'mort'
  | 'lumi'
  | 'crate'
  | 'pillar'
  | 'bush'
  | 'gem'
  | 'gem_mine'
  | 'bullet'
  | 'shotgun_shell'
  | 'sniper_bolt'
  | 'power_fist'
  | 'potion_flask'
  | 'music_note'
  | 'bomb';

export const MODEL_MANIFEST: Record<ModelKey, string> = {
  buck: '/models/buck.glb',
  vex: '/models/vex.glb',
  blaze: '/models/blaze.glb',
  golem: '/models/golem.glb',
  mort: '/models/mort.glb',
  lumi: '/models/lumi.glb',
  crate: '/models/crate.glb',
  pillar: '/models/pillar.glb',
  bush: '/models/bush.glb',
  gem: '/models/gem.glb',
  gem_mine: '/models/gem_mine.glb',
  bullet: '/models/bullet.glb',
  shotgun_shell: '/models/shotgun_shell.glb',
  sniper_bolt: '/models/sniper_bolt.glb',
  power_fist: '/models/power_fist.glb',
  potion_flask: '/models/potion_flask.glb',
  music_note: '/models/music_note.glb',
  bomb: '/models/bomb.glb',
};

const bank = new Map<ModelKey, THREE.Group>();
let preloadPromise: Promise<void> | null = null;

/**
 * Balanced cartoon color correction (gamma ~1.45): deepens Blender's linear-exported
 * pastel colors into vivid Brawl Stars daylight tones without crushing darks or
 * over-saturating shadows, and caps metallic reflection blackout.
 */
export function applyCartoonColorCorrection(root: THREE.Object3D): void {
  const GAMMA = 1.45;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.color.setRGB(
          Math.pow(Math.max(0, mat.color.r), GAMMA),
          Math.pow(Math.max(0, mat.color.g), GAMMA),
          Math.pow(Math.max(0, mat.color.b), GAMMA),
        );
        if (mat.emissiveIntensity > 0) {
          mat.emissive.setRGB(
            Math.pow(Math.max(0, mat.emissive.r), GAMMA),
            Math.pow(Math.max(0, mat.emissive.g), GAMMA),
            Math.pow(Math.max(0, mat.emissive.b), GAMMA),
          );
        }
        // Keep cartoon surfaces crisp without muddy metallic blackouts (no envMap)
        if (mat.metalness > 0.28) {
          mat.metalness = Math.min(0.28, mat.metalness * 0.32);
        }
        mat.roughness = Math.max(0.42, Math.min(0.85, mat.roughness));
      }
    }
  });
}

export function registerModelForTest(key: ModelKey, group: THREE.Group): void {
  bank.set(key, group);
}

export function clearModelsForTest(): void {
  bank.clear();
  preloadPromise = null;
}

export function hasModel(key: ModelKey): boolean {
  return bank.has(key);
}

/**
 * Batches many static instances of a multi-mesh GLB prototype into one
 * THREE.InstancedMesh per sub-mesh, cutting hundreds of draw calls down to <12.
 */
export function createInstancedGlbBatch(
  key: ModelKey,
  transforms: THREE.Matrix4[],
  castShadow = false,
): THREE.Group | null {
  const proto = bank.get(key);
  if (!proto || transforms.length === 0) return null;

  proto.updateMatrixWorld(true);
  const batchGroup = new THREE.Group();
  const combined = new THREE.Matrix4();

  proto.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const im = new THREE.InstancedMesh(child.geometry, child.material, transforms.length);
      for (let i = 0; i < transforms.length; i++) {
        combined.multiplyMatrices(transforms[i], child.matrixWorld);
        im.setMatrixAt(i, combined);
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = castShadow;
      im.receiveShadow = true;
      batchGroup.add(im);
    }
  });

  return batchGroup;
}

export function cloneModel(key: ModelKey, cloneMaterials = false): THREE.Group | null {
  const proto = bank.get(key);
  if (!proto) return null;
  const clone = proto.clone(true);
  if (cloneMaterials) {
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => m.clone());
        } else if (child.material) {
          child.material = child.material.clone();
        }
      }
    });
  }
  return clone;
}

export function preloadAllModels(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  if (typeof window === 'undefined') {
    preloadPromise = Promise.resolve();
    return preloadPromise;
  }

  const loader = new GLTFLoader();
  const entries = Object.entries(MODEL_MANIFEST) as Array<[ModelKey, string]>;

  preloadPromise = Promise.all(
    entries.map(async ([key, url]) => {
      try {
        const gltf = await loader.loadAsync(url);
        const root = gltf.scene;
        applyCartoonColorCorrection(root);
        bank.set(key, root);
      } catch {
        // Fallback procedural mesh will be used cleanly if a model fails to load
      }
    }),
  ).then(() => undefined);

  return preloadPromise;
}
