import * as THREE from 'three';
import {
  BRAWL_BALL_GOAL_MAX_X,
  BRAWL_BALL_GOAL_MIN_X,
  BrawlerId,
  GameMode,
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
  buildAnimatedPreviewStage,
  buildMatchSurround,
  MatchSurroundHandle,
  PreviewStageHandle,
} from './cartoonBackdrop';
import { cloneModel, createInstancedGlbBatch, hasModel } from './modelBank';
import {
  CAMERA_FOV,
  shouldRenderEventVfx,
  stepCameraFollow,
} from './perspective';
import { getGemCrystalGeo } from './projectileMeshes';
import { AimTelegraphInput, VfxManager } from './vfx';
import { buildResultsStage, ResultsStageHandle } from './victoryStage';

function createCheckeredGroundTexture(mapId: MapId): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (mapId === 'iron-foundry') {
    // Realistic industrial steelworks concrete & riveted plate slabs
    ctx.fillStyle = '#606875';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#535b68';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillRect(128, 128, 128, 128);

    // Brushed steel plate grain & subtle wear
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let y = 8; y < 256; y += 16) {
      ctx.fillRect(0, y, 256, 2);
    }
    // Expansion joint bevel seams
    ctx.strokeStyle = 'rgba(18, 22, 28, 0.34)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 124, 124);
    ctx.strokeRect(130, 130, 124, 124);
    ctx.strokeRect(130, 2, 124, 124);
    ctx.strokeRect(2, 130, 124, 124);

    // Subtle corner steel plate rivets
    ctx.fillStyle = 'rgba(24, 28, 36, 0.35)';
    for (const bx of [0, 128]) {
      for (const by of [0, 128]) {
        for (const [rx, ry] of [[14, 14], [114, 14], [14, 114], [114, 114]]) {
          ctx.beginPath();
          ctx.arc(bx + rx, by + ry, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Faint warm amber safety stripe accent along tile edge
    ctx.fillStyle = 'rgba(255, 190, 48, 0.12)';
    ctx.fillRect(12, 120, 40, 4);
    ctx.fillRect(140, 248, 40, 4);
  } else {
    const isCavern = mapId === 'crystal-cavern';
    const c1 = isCavern ? '#e2a85a' : '#65ba49';
    const c2 = isCavern ? '#d4994a' : '#58ab3e';
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = c2;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillRect(128, 128, 128, 128);
    // Subtle tile bevel grout for clean readability without harsh grid lines
    ctx.strokeStyle = isCavern ? 'rgba(66, 30, 6, 0.10)' : 'rgba(14, 52, 16, 0.10)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 124, 124);
    ctx.strokeRect(130, 130, 124, 124);
    ctx.strokeRect(130, 2, 124, 124);
    ctx.strokeRect(2, 130, 124, 124);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(MAP_WIDTH / 2, MAP_HEIGHT / 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createAnimatedLavaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormalDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        // Seamless world-space molten swell across adjacent trench tiles
        if (position.y > 0.0) {
          float swell =
            sin(worldPos.x * 2.1 + uTime * 1.9) * cos(worldPos.z * 1.8 - uTime * 1.4) * 0.024 +
            sin((worldPos.x + worldPos.z) * 3.1 - uTime * 2.6) * 0.012;
          worldPos.y += swell;
        }
        vWorldPos = worldPos.xyz;
        vNormalDir = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormalDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          v += amp * noise(p);
          p = p * 2.03 + vec2(17.1, 31.7);
          amp *= 0.5;
        }
        return v;
      }

      void main() {
        // World-space flowing molten magma (zero tile seams!)
        vec2 p = vWorldPos.xz * 0.72;
        vec2 flow1 = vec2(uTime * 0.28, uTime * 0.16);
        vec2 flow2 = vec2(-uTime * 0.19, uTime * 0.25);

        float warpX = fbm(p + flow1);
        float warpY = fbm(p * 1.15 + flow2 + vec2(4.2, 1.7));
        vec2 warped = p + vec2(warpX, warpY) * 1.25 - flow1 * 0.65;

        float n = fbm(warped * 1.35);
        float veins = 1.0 - abs(fbm(warped * 2.1 + vec2(uTime * 0.18, -uTime * 0.14)) * 2.0 - 1.0);
        veins = pow(clamp(veins, 0.0, 1.0), 2.4);

        float pulse = 0.90 + 0.10 * sin(uTime * 3.1 + p.x * 2.2 - p.y * 1.7);
        float heat = clamp((n * 0.78 + veins * 0.62) * pulse, 0.0, 1.0);

        // Rich molten steelworks magma color ramp: dark cooling slag -> crimson -> bright orange -> white-gold core
        vec3 slag   = vec3(0.18, 0.05, 0.04);
        vec3 redHot = vec3(0.84, 0.16, 0.03);
        vec3 orange = vec3(1.00, 0.44, 0.05);
        vec3 gold   = vec3(1.00, 0.80, 0.18);
        vec3 core   = vec3(1.00, 0.97, 0.68);

        vec3 col = mix(slag, redHot, smoothstep(0.18, 0.40, heat));
        col = mix(col, orange, smoothstep(0.38, 0.60, heat));
        col = mix(col, gold,   smoothstep(0.58, 0.80, heat));
        col = mix(col, core,   smoothstep(0.80, 0.96, heat));

        // Slightly deeper crimson glow on recessed vertical trench sides
        float sideShade = mix(0.82, 1.0, clamp(vNormalDir.y, 0.0, 1.0));
        gl_FragColor = vec4(col * sideShade, 1.0);
      }
    `,
    toneMapped: false,
  });
}

function createLeafBladeGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.18, 0);
  shape.quadraticCurveTo(-0.22, 0.35, 0, 0.72);
  shape.quadraticCurveTo(0.22, 0.35, 0.18, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  geo.center();
  geo.translate(0, 0.32, 0);
  return geo;
}

export class ArenaRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mapGroup: THREE.Group;
  private previewGroup: THREE.Group;
  private resultsGroup: THREE.Group;
  private breakableMeshes: Map<string, THREE.Object3D> = new Map();
  private bushMeshes: THREE.Object3D[] = [];
  private waterMeshes: THREE.Mesh[] = [];
  private lavaMaterial: THREE.ShaderMaterial | null = null;
  private lavaParticles: Array<{
    mesh: THREE.Mesh;
    baseX: number;
    baseZ: number;
    phase: number;
    speed: number;
    kind: 'bubble' | 'ember';
  }> = [];
  private mineCrystal: THREE.Group | null = null;
  private ballRoot: THREE.Group | null = null;
  private ballSpinGroup: THREE.Group | null = null;
  private ballSuperHalo: THREE.Mesh | null = null;
  private brawlers: Map<number, { brawlerId: BrawlerId; team: Team; isLocal: boolean; visual: BrawlerVisual }> =
    new Map();
  private vfx: VfxManager;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private previewVisual: BrawlerVisual | null = null;
  private previewBrawlerId: BrawlerId | null = null;
  private previewGameMode: GameMode = 'gem-grab';
  private previewStage: PreviewStageHandle | null = null;
  private matchSurround: MatchSurroundHandle | null = null;
  private resultsStage: ResultsStageHandle | null = null;
  private resultsElapsed = 0;
  private mode: 'preview' | 'match' | 'results' = 'preview';
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private clock = 0;
  private camPos = new THREE.Vector3(10.5, 18.5, 32);
  private camLook = new THREE.Vector3(10.5, 0, 18);
  private cameraSnapped = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = false;
    // Neutral tone mapping keeps clean, vivid Brawl Stars daylight colors without harsh contrast
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#182a4f');

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.5, 120);

    // Balanced daylight arcade lighting (soft warm bounce + clean key sun + light rim)
    const hemi = new THREE.HemisphereLight(0xe8f6ff, 0x705d4e, 1.08);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff6e0, 1.38);
    sun.position.set(18, 28, 10);
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0x8ec8ff, 0.35);
    rim.position.set(-16, 14, -14);
    this.scene.add(rim);

    this.mapGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.resultsGroup = new THREE.Group();
    this.resultsGroup.visible = false;
    this.scene.add(this.mapGroup);
    this.scene.add(this.previewGroup);
    this.scene.add(this.resultsGroup);

    this.vfx = new VfxManager(this.scene);
    this.buildPreviewPedestal();
    this.resize();
  }

  private clearResultsStage(): void {
    while (this.resultsGroup.children.length > 0) {
      this.resultsGroup.remove(this.resultsGroup.children[0]);
    }
    this.resultsStage = null;
    this.resultsGroup.visible = false;
  }

  private buildPreviewPedestal(gameMode: GameMode = 'gem-grab'): void {
    if (this.previewStage) {
      this.previewGroup.remove(this.previewStage.group);
    }
    this.previewGameMode = gameMode;
    this.previewStage = buildAnimatedPreviewStage(gameMode);
    this.previewGroup.add(this.previewStage.group);
  }

  public setPreviewBrawler(brawlerId: BrawlerId, gameMode?: GameMode): void {
    this.mode = 'preview';
    this.clearResultsStage();
    const targetMode = gameMode ?? this.previewGameMode;
    if (!this.previewStage || targetMode !== this.previewGameMode) {
      this.buildPreviewPedestal(targetMode);
    }
    this.scene.background = new THREE.Color(targetMode === 'brawl-ball' ? '#24a3ff' : '#321c7a');
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

  public refreshPreview(): void {
    if (this.mode !== 'preview' || !this.previewBrawlerId) return;
    const current = this.previewBrawlerId;
    const currentMode = this.previewGameMode;
    this.previewBrawlerId = null;
    this.buildPreviewPedestal(currentMode);
    this.setPreviewBrawler(current, currentMode);
  }

  public renderPreview(dt: number): void {
    this.clock += dt;
    this.previewStage?.update(this.clock, dt);
    if (this.previewVisual) {
      this.previewVisual.root.rotation.y = this.clock * 0.85;
      this.previewVisual.updateAnimation(dt, false, false);
      this.previewVisual.bodyGroup.position.y = this.previewVisual.hasAnimations
        ? 0
        : Math.sin(this.clock * 3.2) * 0.07;
      this.previewVisual.superRing.rotation.z = this.clock * 1.4;
    }
    this.camera.position.set(0, 2.65, 6.4);
    this.camera.lookAt(0, 0.95, 0);
    this.renderer.render(this.scene, this.camera);
  }

  public setResultsScene(state: MatchState, localSlot: number): void {
    this.mode = 'results';
    this.clearResultsStage();
    this.mapGroup.visible = false;
    this.previewGroup.visible = false;
    this.vfx.clear();
    for (const entry of this.brawlers.values()) {
      this.scene.remove(entry.visual.root);
    }
    this.brawlers.clear();

    this.resultsStage = buildResultsStage(state, localSlot);
    this.resultsGroup.add(this.resultsStage.group);
    this.resultsGroup.visible = true;
    this.resultsElapsed = 0;
    this.scene.background = new THREE.Color(this.resultsStage.backgroundHex);
  }

  public renderResults(dt: number): void {
    if (this.mode !== 'results' || !this.resultsStage) return;
    this.resultsElapsed += dt;
    this.resultsStage.update(this.resultsElapsed, dt, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private buildBrawlBallPitchVisuals(): void {
    // Crisp painted white soccer pitch lines (halfway line, center circle, penalty boxes)
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const halfLine = new THREE.Mesh(new THREE.PlaneGeometry(MAP_WIDTH - 2.2, 0.16), lineMat);
    halfLine.rotation.x = -Math.PI / 2;
    halfLine.position.set(MAP_WIDTH / 2, 0.02, MAP_HEIGHT / 2);
    this.mapGroup.add(halfLine);

    const centerCircle = new THREE.Mesh(new THREE.RingGeometry(2.35, 2.52, 36), lineMat);
    centerCircle.rotation.x = -Math.PI / 2;
    centerCircle.position.set(MAP_WIDTH / 2, 0.02, MAP_HEIGHT / 2);
    this.mapGroup.add(centerCircle);

    const kickoffSpot = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), lineMat);
    kickoffSpot.rotation.x = -Math.PI / 2;
    kickoffSpot.position.set(MAP_WIDTH / 2, 0.022, MAP_HEIGHT / 2);
    this.mapGroup.add(kickoffSpot);

    // Build North (Red) & South (Blue) 3D Stadium Goalposts, Crossbars & Nets!
    const goalWidth = BRAWL_BALL_GOAL_MAX_X - BRAWL_BALL_GOAL_MIN_X;
    const goalCenterX = (BRAWL_BALL_GOAL_MIN_X + BRAWL_BALL_GOAL_MAX_X) / 2;
    const postGeo = new THREE.CylinderGeometry(0.14, 0.16, 1.85, 12);
    const crossbarGeo = new THREE.CylinderGeometry(0.13, 0.13, goalWidth + 0.25, 12);
    crossbarGeo.rotateZ(Math.PI / 2);

    const buildGoal = (zLine: number, netDir: number, teamColor: number) => {
      const grp = new THREE.Group();
      const postMat = new THREE.MeshToonMaterial({ color: teamColor });
      const glowLine = new THREE.Mesh(
        new THREE.PlaneGeometry(goalWidth, 0.24),
        new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      glowLine.rotation.x = -Math.PI / 2;
      glowLine.position.set(goalCenterX, 0.025, zLine);
      grp.add(glowLine);

      for (const px of [BRAWL_BALL_GOAL_MIN_X, BRAWL_BALL_GOAL_MAX_X]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(px, 0.92, zLine);
        grp.add(post);
      }
      const bar = new THREE.Mesh(crossbarGeo, postMat);
      bar.position.set(goalCenterX, 1.82, zLine);
      grp.add(bar);

      // Semi-transparent stadium goal net (back wall + roof + side walls)
      const netMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        wireframe: true,
      });
      const depth = 1.35;
      const backNet = new THREE.Mesh(new THREE.PlaneGeometry(goalWidth, 1.8, 12, 5), netMat);
      backNet.position.set(goalCenterX, 0.9, zLine + netDir * depth);
      grp.add(backNet);

      const roofNet = new THREE.Mesh(new THREE.PlaneGeometry(goalWidth, depth, 12, 3), netMat);
      roofNet.rotation.x = Math.PI / 2;
      roofNet.position.set(goalCenterX, 1.8, zLine + netDir * (depth / 2));
      grp.add(roofNet);

      for (const px of [BRAWL_BALL_GOAL_MIN_X, BRAWL_BALL_GOAL_MAX_X]) {
        const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(depth, 1.8, 3, 5), netMat);
        sideNet.rotation.y = Math.PI / 2;
        sideNet.position.set(px, 0.9, zLine + netDir * (depth / 2));
        grp.add(sideNet);
      }

      // Goal box floor tint
      const boxFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(goalWidth, 2.6),
        new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.14, depthWrite: false }),
      );
      boxFloor.rotation.x = -Math.PI / 2;
      boxFloor.position.set(goalCenterX, 0.018, zLine - netDir * 1.3);
      grp.add(boxFloor);

      this.mapGroup.add(grp);
    };

    buildGoal(1.0, -1, 0xff4757); // North = Red Goal (Blue attacks this!)
    buildGoal(MAP_HEIGHT - 1.0, 1, 0x29a8ff); // South = Blue Goal (Red attacks this!)

    // Create rolling 3D Brawl Ball entity (Blender GLB with procedural fallback)
    const root = new THREE.Group();
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 18),
      new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: 0.38, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    root.add(shadow);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.68, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffd43b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    halo.visible = false;
    root.add(halo);

    const spinGroup = new THREE.Group();
    spinGroup.position.y = 0.4;
    const glbBall = cloneModel('brawl_ball');
    if (glbBall) {
      spinGroup.add(glbBall);
    } else {
      spinGroup.add(
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.38, 1),
          new THREE.MeshToonMaterial({ color: 0xffffff }),
        ),
      );
    }
    root.add(spinGroup);
    root.position.set(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
    this.mapGroup.add(root);

    this.ballRoot = root;
    this.ballSpinGroup = spinGroup;
    this.ballSuperHalo = halo;
  }

  public loadMap(mapId: MapId, grid: Uint8Array, mode: GameMode = 'gem-grab'): void {
    this.mode = 'match';
    this.clearResultsStage();
    this.scene.background = new THREE.Color(
      mapId === 'crystal-cavern' ? '#9e5332' : mapId === 'iron-foundry' ? '#2c2224' : '#1b8fd1',
    );
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
    this.lavaMaterial = null;
    this.lavaParticles = [];
    this.mineCrystal = null;
    this.ballRoot = null;
    this.ballSpinGroup = null;
    this.ballSuperHalo = null;
    this.matchSurround = null;

    for (const entry of this.brawlers.values()) {
      this.scene.remove(entry.visual.root);
    }
    this.brawlers.clear();

    // Arena floor (MeshLambertMaterial avoids toon banding washout & pops with crisp key light)
    const floorGeo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT);
    const floorMat = new THREE.MeshLambertMaterial({ map: createCheckeredGroundTexture(mapId) });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
    floor.receiveShadow = true;
    this.mapGroup.add(floor);

    // Rich animated cartoon outer canyon/river surround outside arena walls
    this.matchSurround = buildMatchSurround(mapId);
    this.mapGroup.add(this.matchSurround.group);

    // Subtle soft contact-shadow pad under breakable crates
    const propShadowGeo = new THREE.PlaneGeometry(1.12, 1.12);
    propShadowGeo.rotateX(-Math.PI / 2);
    const propShadowMat = new THREE.MeshBasicMaterial({
      color: 0x24160c,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });

    // Shared detailed crate geometries (banded wooden crate with cross-brace & iron rim)
    const crateCoreGeo = new THREE.BoxGeometry(0.88, 0.9, 0.88);
    const crateTrimGeo = new THREE.BoxGeometry(0.95, 0.14, 0.95);
    const crateBraceGeo = new THREE.BoxGeometry(0.92, 0.12, 0.16);
    const crateMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? '#c97b36' : '#b88346' });
    const crateTopMat = new THREE.MeshToonMaterial({ color: '#e8a85e' });
    const crateIronMat = new THREE.MeshToonMaterial({ color: '#46372d' });

    // Shared octagonal fortress pillar geometries
    const solidColGeo = new THREE.CylinderGeometry(0.49, 0.54, 1.32, 8);
    const solidBandGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.16, 8);
    const solidCapGeo = new THREE.CylinderGeometry(0.4, 0.48, 0.16, 8);
    const solidMat = new THREE.MeshToonMaterial({ color: '#475978' });
    const solidBandMat = new THREE.MeshToonMaterial({ color: '#29354d' });
    const solidCapMat = new THREE.MeshToonMaterial({ color: '#758cb0' });

    // Shared thick Brawl Stars stealth bush canopy geometries (tile-filling merged thicket)
    const bushBaseGeo = new THREE.BoxGeometry(1.06, 0.24, 1.06);
    const bushMoundGeo = new THREE.DodecahedronGeometry(0.42, 0);
    const bushCrownGeo = new THREE.DodecahedronGeometry(0.35, 0);
    const leafGeo = createLeafBladeGeo();
    const bushShadowMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? '#14693a' : '#0f5c32' });
    const bushDarkMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? '#1fa356' : '#188f4c' });
    const bushLightMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? '#49db78' : '#3cd16d' });
    const berryMat = new THREE.MeshBasicMaterial({ color: '#ffd43b' });
    const berryGeo = new THREE.OctahedronGeometry(0.085, 0);

    const isFoundry = mapId === 'iron-foundry';
    const waterGeo = isFoundry
      ? new THREE.BoxGeometry(1.0, 0.18, 1.0, 4, 1, 4)
      : new THREE.BoxGeometry(1.0, 0.18, 1.0);
    let waterMat: THREE.Material;
    if (isFoundry) {
      this.lavaMaterial = createAnimatedLavaMaterial();
      waterMat = this.lavaMaterial;
    } else {
      waterMat = new THREE.MeshToonMaterial({ color: '#26b6ff', emissive: '#083a5c' });
    }
    const lavaBubbleGeo = isFoundry ? new THREE.SphereGeometry(0.11, 7, 6) : null;
    const lavaBubbleMat = isFoundry ? new THREE.MeshBasicMaterial({ color: '#ffcf38' }) : null;
    const lavaEmberGeo = isFoundry ? new THREE.OctahedronGeometry(0.048, 0) : null;
    const lavaEmberMat = isFoundry ? new THREE.MeshBasicMaterial({ color: '#ff8a1f' }) : null;

    const crateKey = isFoundry && hasModel('foundry_crate') ? 'foundry_crate' : 'crate';
    const pillarKey = isFoundry && hasModel('foundry_pillar') ? 'foundry_pillar' : 'pillar';
    const bushKey = isFoundry && hasModel('foundry_bush') ? 'foundry_bush' : 'bush';
    const useInstancedPillars = hasModel(pillarKey);
    const useInstancedBushes = hasModel(bushKey);
    const pillarMatrices: THREE.Matrix4[] = [];
    const bushMatrices: THREE.Matrix4[] = [];
    const tmpPos = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();
    const tmpEuler = new THREE.Euler();
    const tmpScale = new THREE.Vector3();

    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const tile = grid[ty * MAP_WIDTH + tx] as TileType;
        const cx = tx + 0.5;
        const cz = ty + 0.5;

        if (tile === TileType.WALL_BREAKABLE) {
          const glbCrate = cloneModel(crateKey);
          let grp: THREE.Group;
          if (glbCrate) {
            grp = glbCrate;
          } else {
            grp = new THREE.Group();
            const core = new THREE.Mesh(crateCoreGeo, crateMat);
            core.position.y = 0.46;
            core.castShadow = true;
            core.receiveShadow = true;
            grp.add(core);
            const bottomTrim = new THREE.Mesh(crateTrimGeo, crateIronMat);
            bottomTrim.position.y = 0.12;
            grp.add(bottomTrim);
            const topTrim = new THREE.Mesh(crateTrimGeo, crateTopMat);
            topTrim.position.y = 0.92;
            grp.add(topTrim);
            const brace = new THREE.Mesh(crateBraceGeo, crateIronMat);
            brace.position.y = 0.99;
            brace.rotation.y = Math.PI / 4;
            grp.add(brace);
          }
          const crateShadow = new THREE.Mesh(propShadowGeo, propShadowMat);
          crateShadow.position.set(0.06, 0.015, 0.06);
          grp.add(crateShadow);
          grp.position.set(cx, 0, cz);
          this.mapGroup.add(grp);
          this.breakableMeshes.set(`${tx},${ty}`, grp);
        } else if (tile === TileType.WALL_SOLID) {
          if (useInstancedPillars) {
            const m = new THREE.Matrix4();
            m.makeTranslation(cx, 0, cz);
            pillarMatrices.push(m);
          } else {
            const grp = new THREE.Group();
            const col = new THREE.Mesh(solidColGeo, solidMat);
            col.position.y = 0.66;
            col.rotation.y = Math.PI / 8;
            col.castShadow = true;
            col.receiveShadow = true;
            grp.add(col);
            const band = new THREE.Mesh(solidBandGeo, solidBandMat);
            band.position.y = 0.34;
            band.rotation.y = Math.PI / 8;
            grp.add(band);
            const cap = new THREE.Mesh(solidCapGeo, solidCapMat);
            cap.position.y = 1.38;
            cap.rotation.y = Math.PI / 8;
            grp.add(cap);
            grp.position.set(cx, 0, cz);
            this.mapGroup.add(grp);
          }
        } else if (tile === TileType.BUSH) {
          const seed = (tx * 17 + ty * 31) % 10;
          if (useInstancedBushes) {
            tmpPos.set(cx, 0, cz);
            tmpEuler.set(0, ((tx + ty) % 4) * (Math.PI / 2), 0);
            tmpQuat.setFromEuler(tmpEuler);
            const sc = 0.98 + (seed % 3) * 0.04;
            tmpScale.set(sc, 0.96 + (seed % 2) * 0.08, sc);
            const m = new THREE.Matrix4().compose(tmpPos, tmpQuat, tmpScale);
            bushMatrices.push(m);
          } else {
            const grp = new THREE.Group();
            const basePad = new THREE.Mesh(bushBaseGeo, bushShadowMat);
            basePad.position.y = 0.12;
            basePad.receiveShadow = true;
            grp.add(basePad);

            const moundOffsets: Array<[number, number, number, number]> = [
              [-0.27, 0.44, -0.25, 1.04],
              [0.27, 0.42, -0.24, 0.98],
              [-0.25, 0.45, 0.27, 1.0],
              [0.26, 0.43, 0.26, 1.05],
            ];
            for (let i = 0; i < moundOffsets.length; i++) {
              const [ox, oy, oz, sc] = moundOffsets[i];
              const mound = new THREE.Mesh(bushMoundGeo, i % 2 === 0 ? bushDarkMat : bushLightMat);
              mound.position.set(ox, oy, oz);
              mound.scale.set(sc * 1.08, sc * 0.88, sc * 1.08);
              mound.rotation.set(seed * 0.2 + i, seed * 0.5 + i * 1.2, i * 0.3);
              mound.castShadow = true;
              mound.receiveShadow = true;
              grp.add(mound);
            }

            const crown = new THREE.Mesh(bushCrownGeo, bushLightMat);
            crown.position.set(((seed % 3) - 1) * 0.06, 0.68, (((seed >> 1) % 3) - 1) * 0.06);
            crown.scale.set(1.22, 0.95, 1.22);
            crown.rotation.set(0.3, seed * 0.7, 0.2);
            crown.castShadow = true;
            grp.add(crown);

            for (let i = 0; i < 3; i++) {
              const ang = (i / 3) * Math.PI * 2 + seed * 0.6;
              const tuft = new THREE.Mesh(leafGeo, i === 0 ? bushLightMat : bushDarkMat);
              tuft.position.set(Math.cos(ang) * 0.2, 0.64, Math.sin(ang) * 0.2);
              tuft.rotation.y = -ang;
              tuft.rotation.x = 0.45;
              tuft.scale.setScalar(0.72);
              grp.add(tuft);
            }

            if ((tx + ty) % 4 === 0) {
              const bud = new THREE.Mesh(berryGeo, berryMat);
              bud.position.set(0.18, 0.96, -0.12);
              grp.add(bud);
            }

            grp.position.set(cx, 0, cz);
            this.mapGroup.add(grp);
            this.bushMeshes.push(grp);
          }
        } else if (tile === TileType.WATER) {
          const w = new THREE.Mesh(waterGeo, waterMat);
          w.position.set(cx, -0.02, cz);
          this.mapGroup.add(w);
          this.waterMeshes.push(w);
          if (isFoundry && lavaBubbleGeo && lavaBubbleMat && lavaEmberGeo && lavaEmberMat) {
            const seed = (tx * 37 + ty * 91) % 100;
            if (seed % 2 === 0) {
              const bubble = new THREE.Mesh(lavaBubbleGeo, lavaBubbleMat);
              const bx = cx + ((seed % 7) - 3) * 0.09;
              const bz = cz + (((seed * 3) % 7) - 3) * 0.09;
              bubble.position.set(bx, 0.05, bz);
              this.mapGroup.add(bubble);
              this.lavaParticles.push({
                mesh: bubble,
                baseX: bx,
                baseZ: bz,
                phase: seed * 0.17,
                speed: 0.75 + (seed % 5) * 0.14,
                kind: 'bubble',
              });
            }
            if (seed % 3 === 0) {
              const ember = new THREE.Mesh(lavaEmberGeo, lavaEmberMat);
              const ex = cx + (((seed * 5) % 7) - 3) * 0.1;
              const ez = cz + (((seed * 2) % 7) - 3) * 0.1;
              ember.position.set(ex, 0.15, ez);
              this.mapGroup.add(ember);
              this.lavaParticles.push({
                mesh: ember,
                baseX: ex,
                baseZ: ez,
                phase: seed * 0.29,
                speed: 0.55 + (seed % 4) * 0.12,
                kind: 'ember',
              });
            }
          }
        } else if (tile === TileType.GEM_MINE) {
          const glbMine = cloneModel('gem_mine');
          if (glbMine) {
            glbMine.position.set(cx, 0, cz);
            this.mapGroup.add(glbMine);
            this.mineCrystal = null;
          } else {
            const well = new THREE.Mesh(
              new THREE.CylinderGeometry(0.72, 0.92, 0.56, 8),
              new THREE.MeshToonMaterial({ color: '#3b2454' }),
            );
            well.position.set(cx, 0.28, cz);
            well.castShadow = true;
            this.mapGroup.add(well);

            const rimRing = new THREE.Mesh(
              new THREE.TorusGeometry(0.66, 0.1, 8, 8),
              new THREE.MeshToonMaterial({ color: '#695285' }),
            );
            rimRing.rotation.x = Math.PI / 2;
            rimRing.position.set(cx, 0.56, cz);
            this.mapGroup.add(rimRing);

            const vortex = new THREE.Mesh(
              new THREE.CircleGeometry(0.56, 16),
              new THREE.MeshBasicMaterial({ color: 0xc039ff }),
            );
            vortex.rotation.x = -Math.PI / 2;
            vortex.position.set(cx, 0.57, cz);
            this.mapGroup.add(vortex);

            const cluster = new THREE.Group();
            const mainCrystal = new THREE.Mesh(
              getGemCrystalGeo(),
              new THREE.MeshToonMaterial({ color: 0xe66bff, emissive: 0x7200c4 }),
            );
            mainCrystal.scale.setScalar(1.35);
            cluster.add(mainCrystal);
            for (let i = 0; i < 3; i++) {
              const ang = (i / 3) * Math.PI * 2;
              const shard = new THREE.Mesh(
                getGemCrystalGeo(),
                new THREE.MeshToonMaterial({ color: 0xc946ff, emissive: 0x520096 }),
              );
              shard.scale.setScalar(0.68);
              shard.position.set(Math.cos(ang) * 0.28, -0.12, Math.sin(ang) * 0.28);
              shard.rotation.z = -Math.cos(ang) * 0.35;
              shard.rotation.x = Math.sin(ang) * 0.35;
              cluster.add(shard);
            }
            cluster.position.set(cx, 1.2, cz);
            this.mapGroup.add(cluster);
            this.mineCrystal = cluster;
          }
        }
      }
    }

    // Add batched GPU-instanced pillars & thick bushes (cuts >2,000 draw calls down to <20!)
    if (pillarMatrices.length > 0) {
      const pillarBatch = createInstancedGlbBatch(pillarKey, pillarMatrices, false);
      if (pillarBatch) this.mapGroup.add(pillarBatch);
    }
    if (bushMatrices.length > 0) {
      const bushBatch = createInstancedGlbBatch(bushKey, bushMatrices, false);
      if (bushBatch) this.mapGroup.add(bushBatch);
    }

    if (mode === 'brawl-ball') {
      this.buildBrawlBallPitchVisuals();
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
        this.vfx.spawnHitBurst(ev.x, ev.y, 0xffe066, 6);
      } else if (ev.type === 'heal') {
        this.vfx.spawnHealBurst(ev.x, ev.y);
      } else if (ev.type === 'kill') {
        this.vfx.spawnExplosion(ev.x, ev.y, 0xff5266, 1.15);
        this.triggerShake(0.26, 0.26);
      } else if (ev.type === 'ball_kick') {
        this.vfx.spawnHitBurst(ev.x, ev.y, ev.isSuper ? 0xffd43b : 0x56ecff, ev.isSuper ? 10 : 5);
        if (ev.isSuper) this.triggerShake(0.20, 0.18);
      } else if (ev.type === 'tackle') {
        if (ev.stolen) {
          this.vfx.spawnHitBurst(ev.x, ev.y, 0x4ce8ff, 10);
          this.vfx.spawnHitBurst(ev.x, ev.y, 0xffd43b, 6);
          this.triggerShake(0.22, 0.20);
        } else {
          this.vfx.spawnHitBurst(ev.x, ev.y, 0x7df6ff, 5);
        }
      } else if (ev.type === 'goal') {
        const goalZ = ev.team === 'blue' ? 1.2 : MAP_HEIGHT - 1.2;
        this.vfx.spawnExplosion(MAP_WIDTH / 2, goalZ, ev.team === 'blue' ? 0x29a8ff : 0xff4757, 1.65);
        this.triggerShake(0.35, 0.30);
      } else if (ev.type === 'attack') {
        if (ev.brawlerId === 'buck' || ev.brawlerId === 'blaze' || ev.brawlerId === 'vex') {
          this.vfx.spawnMuzzleFlash(ev.x, ev.y, ev.angle, ev.isSuper);
        } else if (ev.brawlerId === 'kage') {
          this.vfx.spawnSlashBurst(ev.x, ev.y, ev.angle, ev.isSuper);
        }
        if (ev.isSuper) {
          this.triggerShake(0.18, 0.16);
        }
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
      entry.visual.bodyGroup.rotation.z = b.dash ? -0.34 : b.tackleTimer > 0 ? -0.28 : 0;

      const moving = Math.hypot(b.vx, b.vy) > 0.25;
      if (entry.visual.hasAnimations) {
        entry.visual.updateAnimation(dt, moving && !b.leap && !b.dash, b.recoilTimer > 0.14);
        entry.visual.bodyGroup.position.y = heightY;
        entry.visual.bodyGroup.scale.set(1, 1, 1);
      } else {
        const walkBob = moving && !b.leap && !b.dash ? Math.abs(Math.sin(this.clock * 12 + b.slotIndex)) * 0.1 : 0;
        const recoilSquash = b.recoilTimer > 0 ? 1 + (b.recoilTimer / 0.22) * 0.14 : 1;
        entry.visual.bodyGroup.position.y = heightY + walkBob;
        entry.visual.bodyGroup.scale.set(recoilSquash, 1 / Math.sqrt(recoilSquash), recoilSquash);
      }

      entry.visual.superRing.visible = b.superCharge >= 100;
      if (entry.visual.superRing.visible) {
        entry.visual.superRing.rotation.z = this.clock * 3.0;
      }
      entry.visual.shieldDome.visible = b.invulnTimer > 0;

      // Bush translucency for allies / local player
      const inBush = isPointInBush(state.grid, b.x, b.y);
      entry.visual.setOpacity(inBush && b.team === viewerTeam ? 0.56 : 1.0);
    }

    // Animate bushes, water, outer cartoon surround, and center gem mine crystal cluster
    this.matchSurround?.update(this.clock, dt);
    for (let i = 0; i < this.bushMeshes.length; i++) {
      this.bushMeshes[i].rotation.z = Math.sin(this.clock * 2.0 + i * 0.7) * 0.022;
    }
    if (this.lavaMaterial) {
      this.lavaMaterial.uniforms.uTime.value = this.clock;
      for (let i = 0; i < this.lavaParticles.length; i++) {
        const p = this.lavaParticles[i];
        const cycle = (this.clock * p.speed + p.phase) % 1;
        if (p.kind === 'bubble') {
          // Swell slowly on the magma surface, then pop sharply near cycle = 0.85
          const swell = cycle < 0.82 ? Math.sin((cycle / 0.82) * Math.PI * 0.62) : Math.max(0, 1 - (cycle - 0.82) / 0.18);
          p.mesh.scale.set(swell * 1.15, swell * 0.72, swell * 1.15);
          p.mesh.position.set(
            p.baseX + Math.sin(this.clock * 0.6 + p.phase) * 0.08,
            0.055 + swell * 0.045,
            p.baseZ + Math.cos(this.clock * 0.5 + p.phase) * 0.08,
          );
        } else {
          // Glowing spark drifting upward from molten trench and fading out
          const shrink = Math.sin(cycle * Math.PI);
          p.mesh.scale.setScalar(Math.max(0.01, shrink * 1.1));
          p.mesh.position.set(
            p.baseX + Math.sin(this.clock * 2.2 + p.phase) * 0.18,
            0.12 + cycle * 1.25,
            p.baseZ + Math.cos(this.clock * 1.9 + p.phase) * 0.18,
          );
          p.mesh.rotation.y = this.clock * 4 + p.phase;
        }
      }
    } else {
      for (let i = 0; i < this.waterMeshes.length; i++) {
        this.waterMeshes[i].position.y = -0.03 + Math.sin(this.clock * 2.6 + i * 0.4) * 0.025;
      }
    }
    if (this.mineCrystal) {
      this.mineCrystal.rotation.y = this.clock * 1.8;
      this.mineCrystal.position.y = 1.2 + Math.sin(this.clock * 3.5) * 0.14;
    }

    // Sync rolling 3D Brawl Ball position, realistic roll spin, and Super-Kick halo!
    if (this.ballRoot && state.ball) {
      this.ballRoot.visible = true;
      this.ballRoot.position.set(state.ball.x, 0, state.ball.y);
      if (this.ballSpinGroup) {
        this.ballSpinGroup.rotation.z -= state.ball.vx * dt * 2.2;
        this.ballSpinGroup.rotation.x += state.ball.vy * dt * 2.2;
        const bounce = state.ball.holderSlot !== null ? Math.abs(Math.sin(this.clock * 9)) * 0.08 : 0;
        this.ballSpinGroup.position.y = 0.4 + bounce;
      }
      if (this.ballSuperHalo) {
        const showHalo = state.ball.isSuperKick || state.ball.holderSlot !== null;
        this.ballSuperHalo.visible = showHalo;
        (this.ballSuperHalo.material as THREE.MeshBasicMaterial).color.setHex(
          state.ball.isSuperKick ? 0xffd43b : 0x56ecff,
        );
        this.ballSuperHalo.rotation.z = this.clock * 3.5;
      }
    } else if (this.ballRoot) {
      this.ballRoot.visible = false;
    }

    // Update VFX + wall-clipped aim telegraph
    this.vfx.updateTelegraph(telegraph, state.grid);
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
