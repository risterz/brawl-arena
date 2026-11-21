import * as THREE from 'three';
import {
  BrawlerId,
  isBrawlerVisibleToTeam,
  isPointInBush,
  MAP_HEIGHT,
  MAP_WIDTH,
  MapId,
  MatchEvent,
  MatchState,
  Team,
  TileType,
} from '@brawl-arena/shared';
import { BrawlerVisual, createBrawlerMesh } from './brawlerMeshes';
import {
  CAMERA_FOV,
  shouldRenderEventVfx,
  stepCameraFollow,
} from './perspective';
import { AimTelegraphInput, VfxManager } from './vfx';

function createCheckeredGroundTexture(mapId: MapId): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const isCavern = mapId === 'crystal-cavern';
  const c1 = isCavern ? '#eab66e' : '#7ec850';
  const c2 = isCavern ? '#dfaa60' : '#72bc46';
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = c2;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillRect(128, 128, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);
  ctx.strokeRect(130, 130, 124, 124);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(MAP_WIDTH / 2, MAP_HEIGHT / 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ArenaRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mapGroup: THREE.Group;
  private previewGroup: THREE.Group;
  private breakableMeshes: Map<string, THREE.Object3D> = new Map();
  private bushMeshes: THREE.Object3D[] = [];
  private waterMeshes: THREE.Mesh[] = [];
  private mineCrystal: THREE.Mesh | null = null;
  private brawlers: Map<number, { brawlerId: BrawlerId; team: Team; isLocal: boolean; visual: BrawlerVisual }> =
    new Map();
  private vfx: VfxManager;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private previewVisual: BrawlerVisual | null = null;
  private previewBrawlerId: BrawlerId | null = null;
  private mode: 'preview' | 'match' = 'preview';
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private clock = 0;
  private camPos = new THREE.Vector3(10.5, 18.5, 32);
  private camLook = new THREE.Vector3(10.5, 0, 18);
  private cameraSnapped = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#19335c');

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.5, 120);

    // Bright cartoon daylight lighting
    const hemi = new THREE.HemisphereLight(0xd9f2ff, 0x5c4738, 1.15);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff5db, 1.35);
    sun.position.set(16, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 75;
    const d = 24;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);

    this.mapGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.scene.add(this.previewGroup);

    this.vfx = new VfxManager(this.scene);
    this.buildPreviewPedestal();
    this.resize();
  }

  private buildPreviewPedestal(): void {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.85, 0.45, 24),
      new THREE.MeshToonMaterial({ color: 0x264b8d }),
    );
    base.position.y = -0.22;
    base.receiveShadow = true;
    this.previewGroup.add(base);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.58, 0.08, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd43b }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    this.previewGroup.add(rim);
  }

  public setPreviewBrawler(brawlerId: BrawlerId): void {
    this.mode = 'preview';
    this.mapGroup.visible = false;
    this.previewGroup.visible = true;
    this.vfx.clear();
    for (const entry of this.brawlers.values()) {
      this.scene.remove(entry.visual.root);
    }
    this.brawlers.clear();

    if (this.previewBrawlerId !== brawlerId) {
      if (this.previewVisual) {
        this.previewGroup.remove(this.previewVisual.root);
      }
      this.previewVisual = createBrawlerMesh(brawlerId, 'blue', true);
      this.previewVisual.root.scale.setScalar(1.35);
      this.previewVisual.superRing.visible = true;
      this.previewGroup.add(this.previewVisual.root);
      this.previewBrawlerId = brawlerId;
    }
  }

  public renderPreview(dt: number): void {
    this.clock += dt;
    if (this.previewVisual) {
      this.previewVisual.root.rotation.y = this.clock * 0.85;
      this.previewVisual.bodyGroup.position.y = Math.sin(this.clock * 3.2) * 0.07;
      this.previewVisual.superRing.rotation.z = this.clock * 1.4;
    }
    this.camera.position.set(0, 2.8, 6.2);
    this.camera.lookAt(0, 0.9, 0);
    this.renderer.render(this.scene, this.camera);
  }

  public loadMap(mapId: MapId, grid: Uint8Array): void {
    this.mode = 'match';
    this.cameraSnapped = false;
    this.previewGroup.visible = false;
    this.mapGroup.visible = true;
    this.vfx.clear();

    while (this.mapGroup.children.length > 0) {
      this.mapGroup.remove(this.mapGroup.children[0]);
    }
    this.breakableMeshes.clear();
    this.bushMeshes = [];
    this.waterMeshes = [];
    this.mineCrystal = null;

    for (const entry of this.brawlers.values()) {
      this.scene.remove(entry.visual.root);
    }
    this.brawlers.clear();

    // Arena floor
    const floorGeo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT);
    const floorMat = new THREE.MeshToonMaterial({ map: createCheckeredGroundTexture(mapId) });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
    floor.receiveShadow = true;
    this.mapGroup.add(floor);

    // Outer surround floor
    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_WIDTH + 34, MAP_HEIGHT + 34),
      new THREE.MeshBasicMaterial({ color: mapId === 'crystal-cavern' ? '#243456' : '#1b4965' }),
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.set(MAP_WIDTH / 2, -0.05, MAP_HEIGHT / 2);
    this.mapGroup.add(surround);

    // Shared geometries/materials for crisp 3D tile blocks
    const crateGeo = new THREE.BoxGeometry(0.94, 0.95, 0.94);
    const crateTopGeo = new THREE.BoxGeometry(0.8, 0.14, 0.8);
    const crateMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? '#c97b36' : '#b88346' });
    const crateTopMat = new THREE.MeshToonMaterial({ color: '#e8a85e' });

    const solidGeo = new THREE.BoxGeometry(0.98, 1.32, 0.98);
    const solidMat = new THREE.MeshToonMaterial({ color: '#455470' });
    const solidCapMat = new THREE.MeshToonMaterial({ color: '#6b7f9e' });

    const bushGeo = new THREE.ConeGeometry(0.46, 0.95, 6);
    const bushMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? '#2ec26c' : '#1fa85c' });
    const bushTipMat = new THREE.MeshToonMaterial({ color: '#58e38a' });

    const waterGeo = new THREE.BoxGeometry(1.0, 0.18, 1.0);
    const waterMat = new THREE.MeshToonMaterial({ color: '#26b6ff', emissive: '#083a5c' });

    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const tile = grid[ty * MAP_WIDTH + tx] as TileType;
        const cx = tx + 0.5;
        const cz = ty + 0.5;

        if (tile === TileType.WALL_BREAKABLE) {
          const grp = new THREE.Group();
          const box = new THREE.Mesh(crateGeo, crateMat);
          box.position.y = 0.475;
          box.castShadow = true;
          box.receiveShadow = true;
          grp.add(box);
          const cap = new THREE.Mesh(crateTopGeo, crateTopMat);
          cap.position.y = 0.98;
          grp.add(cap);
          grp.position.set(cx, 0, cz);
          this.mapGroup.add(grp);
          this.breakableMeshes.set(`${tx},${ty}`, grp);
        } else if (tile === TileType.WALL_SOLID) {
          const grp = new THREE.Group();
          const box = new THREE.Mesh(solidGeo, solidMat);
          box.position.y = 0.66;
          box.castShadow = true;
          box.receiveShadow = true;
          grp.add(box);
          const cap = new THREE.Mesh(crateTopGeo, solidCapMat);
          cap.position.y = 1.35;
          grp.add(cap);
          grp.position.set(cx, 0, cz);
          this.mapGroup.add(grp);
        } else if (tile === TileType.BUSH) {
          const grp = new THREE.Group();
          for (let i = 0; i < 3; i++) {
            const tuft = new THREE.Mesh(bushGeo, i === 0 ? bushTipMat : bushMat);
            const ang = (i / 3) * Math.PI * 2 + (tx + ty) * 0.5;
            tuft.position.set(Math.cos(ang) * 0.18, 0.44, Math.sin(ang) * 0.18);
            tuft.scale.setScalar(i === 0 ? 0.95 : 0.78);
            grp.add(tuft);
          }
          grp.position.set(cx, 0, cz);
          this.mapGroup.add(grp);
          this.bushMeshes.push(grp);
        } else if (tile === TileType.WATER) {
          const w = new THREE.Mesh(waterGeo, waterMat);
          w.position.set(cx, -0.02, cz);
          this.mapGroup.add(w);
          this.waterMeshes.push(w);
        } else if (tile === TileType.GEM_MINE) {
          const crater = new THREE.Mesh(
            new THREE.CylinderGeometry(0.68, 0.85, 0.55, 10),
            new THREE.MeshToonMaterial({ color: '#3b2454' }),
          );
          crater.position.set(cx, 0.27, cz);
          crater.castShadow = true;
          this.mapGroup.add(crater);

          const glow = new THREE.Mesh(
            new THREE.CircleGeometry(0.55, 16),
            new THREE.MeshBasicMaterial({ color: 0xc039ff }),
          );
          glow.rotation.x = -Math.PI / 2;
          glow.position.set(cx, 0.56, cz);
          this.mapGroup.add(glow);

          const crystal = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.42, 0),
            new THREE.MeshToonMaterial({ color: 0xe66bff, emissive: 0x7200c4 }),
          );
          crystal.position.set(cx, 1.15, cz);
          this.mapGroup.add(crystal);
          this.mineCrystal = crystal;
        }
      }
    }
  }

  public removeWall(tx: number, ty: number, spawnVfx = true): void {
    const key = `${tx},${ty}`;
    const obj = this.breakableMeshes.get(key);
    if (obj) {
      this.mapGroup.remove(obj);
      this.breakableMeshes.delete(key);
      if (spawnVfx) {
        this.vfx.spawnWallRubble(tx, ty);
      }
    }
  }

  public applyEvents(events: MatchEvent[], state: MatchState | null = null, localSlot = 0): void {
    const viewerTeam: Team = state?.brawlers[localSlot]?.team ?? 'blue';
    for (const ev of events) {
      if (!shouldRenderEventVfx(ev, state, viewerTeam)) continue;
      if (ev.type === 'wall_break') {
        for (const t of ev.tiles) {
          this.removeWall(t.tx, t.ty, true);
        }
        this.triggerShake(0.22, 0.22);
      } else if (ev.type === 'hit') {
        this.vfx.spawnHitBurst(ev.x, ev.y, 0xffe066, 5);
      } else if (ev.type === 'heal') {
        this.vfx.spawnHitBurst(ev.x, ev.y, 0x5effb1, 5);
      } else if (ev.type === 'kill') {
        this.vfx.spawnHitBurst(ev.x, ev.y, 0xff5266, 14);
        this.triggerShake(0.26, 0.26);
      } else if (ev.type === 'attack' && ev.isSuper) {
        this.triggerShake(0.18, 0.16);
      }
    }
  }

  public triggerShake(duration: number, intensity: number): void {
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  public syncState(
    state: MatchState,
    localSlot: number,
    dt: number,
    telegraph: AimTelegraphInput | null,
  ): void {
    if (this.mode !== 'match') return;
    this.clock += dt;

    // Remove any walls already broken in state grid
    for (const [key] of this.breakableMeshes) {
      const [txStr, tyStr] = key.split(',');
      const tx = Number(txStr);
      const ty = Number(tyStr);
      if (state.grid[ty * MAP_WIDTH + tx] !== TileType.WALL_BREAKABLE) {
        this.removeWall(tx, ty, false);
      }
    }

    const localBrawler = state.brawlers[localSlot] ?? state.brawlers[0];
    const viewerTeam: Team = localBrawler ? localBrawler.team : 'blue';

    // Sync brawlers
    for (const b of state.brawlers) {
      let entry = this.brawlers.get(b.slotIndex);
      const isLocal = b.slotIndex === localSlot;
      if (!entry || entry.brawlerId !== b.brawlerId || entry.team !== b.team || entry.isLocal !== isLocal) {
        if (entry) this.scene.remove(entry.visual.root);
        const visual = createBrawlerMesh(b.brawlerId, b.team, isLocal);
        this.scene.add(visual.root);
        entry = { brawlerId: b.brawlerId, team: b.team, isLocal, visual };
        this.brawlers.set(b.slotIndex, entry);
      }

      const visible = b.alive && isBrawlerVisibleToTeam(state, b, viewerTeam);
      entry.visual.root.visible = visible;
      if (!visible) continue;

      let heightY = 0;
      if (b.leap) {
        const t = Math.min(1, b.leap.elapsed / Math.max(0.05, b.leap.duration));
        heightY = Math.sin(t * Math.PI) * b.leap.height;
      }

      entry.visual.root.position.set(b.x, 0, b.y);
      entry.visual.bodyGroup.rotation.y = -b.facing;

      const moving = Math.hypot(b.vx, b.vy) > 0.25;
      const walkBob = moving && !b.leap ? Math.abs(Math.sin(this.clock * 12 + b.slotIndex)) * 0.1 : 0;
      const recoilSquash = b.recoilTimer > 0 ? 1 + (b.recoilTimer / 0.22) * 0.14 : 1;
      entry.visual.bodyGroup.position.y = heightY + walkBob;
      entry.visual.bodyGroup.scale.set(recoilSquash, 1 / Math.sqrt(recoilSquash), recoilSquash);

      entry.visual.superRing.visible = b.superCharge >= 100;
      if (entry.visual.superRing.visible) {
        entry.visual.superRing.rotation.z = this.clock * 3.0;
      }
      entry.visual.shieldDome.visible = b.invulnTimer > 0;

      // Bush translucency for allies / local player
      const inBush = isPointInBush(state.grid, b.x, b.y);
      entry.visual.setOpacity(inBush && b.team === viewerTeam ? 0.56 : 1.0);
    }

    // Animate bushes, water, and center gem mine crystal
    for (let i = 0; i < this.bushMeshes.length; i++) {
      this.bushMeshes[i].rotation.z = Math.sin(this.clock * 2.2 + i * 0.7) * 0.05;
    }
    for (let i = 0; i < this.waterMeshes.length; i++) {
      this.waterMeshes[i].position.y = -0.03 + Math.sin(this.clock * 2.6 + i * 0.4) * 0.025;
    }
    if (this.mineCrystal) {
      this.mineCrystal.rotation.y = this.clock * 1.8;
      this.mineCrystal.position.y = 1.15 + Math.sin(this.clock * 3.5) * 0.14;
    }

    // Update VFX + aim telegraph
    this.vfx.updateTelegraph(telegraph);
    this.vfx.sync(state, dt);

    // Smooth camera follow with immediate snap on match start (no Red-side sweep)
    const targetX = localBrawler ? localBrawler.x : MAP_WIDTH / 2;
    const targetY = localBrawler ? localBrawler.y : MAP_HEIGHT / 2;
    const nextCam = stepCameraFollow(
      {
        camX: this.camPos.x,
        camY: this.camPos.y,
        camZ: this.camPos.z,
        lookX: this.camLook.x,
        lookZ: this.camLook.z,
      },
      targetX,
      targetY,
      viewerTeam,
      dt,
      this.cameraSnapped,
    );
    this.cameraSnapped = true;
    this.camPos.set(nextCam.camX, nextCam.camY, nextCam.camZ);
    this.camLook.set(nextCam.lookX, 0, nextCam.lookZ);

    let sx = 0;
    let sz = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      sx = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      sz = (Math.random() - 0.5) * 2 * this.shakeIntensity;
    }

    this.camera.position.set(this.camPos.x + sx, this.camPos.y, this.camPos.z + sz);
    this.camera.lookAt(this.camLook.x, 0, this.camLook.z);
    this.renderer.render(this.scene, this.camera);
  }

  public screenToWorldGround(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      return { x: hit.x, y: hit.z };
    }
    return null;
  }

  public projectToScreen(wx: number, wy: number, heightY: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(wx, heightY, wy);
    v.project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((v.x + 1) / 2) * rect.width,
      y: ((-v.y + 1) / 2) * rect.height,
      visible: v.z < 1 && v.x >= -1.15 && v.x <= 1.15 && v.y >= -1.15 && v.y <= 1.15,
    };
  }

  public resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = Math.max(0.5, w / Math.max(1, h));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public dispose(): void {
    this.renderer.dispose();
  }
}
