import {
  BRAWLERS,
  CompactInput,
  inputsDiffer,
  MatchState,
  PlayerInput,
  quantizeInput,
  Team,
} from '@brawl-arena/shared';
import { screenAimToWorldAngle, screenDirToWorldDir } from '../render/perspective';
import { AimTelegraphInput } from '../render/vfx';

export interface PointerCapabilities {
  coarsePointer: boolean;
  anyFinePointer: boolean;
  maxTouchPoints: number;
}

export function detectCoarseTouchPointer(caps: PointerCapabilities): boolean {
  if (caps.coarsePointer) return true;
  return caps.maxTouchPoints > 0 && !caps.anyFinePointer;
}

export class InputThrottle {
  private lastSent: CompactInput | null = null;
  private lastSentMs = -Infinity;
  private readonly minIntervalMs: number;
  private readonly keepaliveMs: number;

  constructor(minIntervalMs = 50, keepaliveMs = 1000) {
    this.minIntervalMs = minIntervalMs;
    this.keepaliveMs = keepaliveMs;
  }

  public reset(): void {
    this.lastSent = null;
    this.lastSentMs = -Infinity;
  }

  public shouldSend(input: PlayerInput, nowMs: number): boolean {
    const q = quantizeInput(input);
    const elapsed = nowMs - this.lastSentMs;

    if (this.lastSent === null) {
      this.lastSent = q;
      this.lastSentMs = nowMs;
      return true;
    }

    // Immediate edge send for fire / superFire / autoAim triggers
    const actionRising =
      ((q.fl & 1) !== 0 && (this.lastSent.fl & 1) === 0) ||
      ((q.fl & 2) !== 0 && (this.lastSent.fl & 2) === 0) ||
      ((q.fl & 4) !== 0 && (this.lastSent.fl & 4) === 0);

    if (actionRising) {
      this.lastSent = q;
      this.lastSentMs = nowMs;
      return true;
    }

    if (inputsDiffer(this.lastSent, q)) {
      if (elapsed >= this.minIntervalMs) {
        this.lastSent = q;
        this.lastSentMs = nowMs;
        return true;
      }
      return false;
    }

    if (elapsed >= this.keepaliveMs) {
      this.lastSent = q;
      this.lastSentMs = nowMs;
      return true;
    }

    return false;
  }
}

interface TouchStickState {
  pointerId: number | null;
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  movedDist: number;
  active: boolean;
}

export class ControlManager {
  private container: HTMLElement;
  private portraitBlocker: HTMLElement;
  private keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private mouseDownLeft = false;
  private mouseDownRight = false;
  private pendingFire = false;
  private pendingSuper = false;
  private pendingAutoAim = false;
  private isTouch = false;
  private active = false;

  private moveStickEl: HTMLDivElement | null = null;
  private moveKnobEl: HTMLDivElement | null = null;
  private aimStickEl: HTMLDivElement | null = null;
  private aimKnobEl: HTMLDivElement | null = null;
  private superStickEl: HTMLDivElement | null = null;
  private superKnobEl: HTMLDivElement | null = null;

  private moveStick: TouchStickState = { pointerId: null, cx: 0, cy: 0, dx: 0, dy: 0, movedDist: 0, active: false };
  private aimStick: TouchStickState = { pointerId: null, cx: 0, cy: 0, dx: 0, dy: 0, movedDist: 0, active: false };
  private superStick: TouchStickState = { pointerId: null, cx: 0, cy: 0, dx: 0, dy: 0, movedDist: 0, active: false };

  private lastAimAngle = -Math.PI / 2;
  private onUnlockAudio: () => void;

  constructor(container: HTMLElement, portraitBlocker: HTMLElement, onUnlockAudio: () => void) {
    this.container = container;
    this.portraitBlocker = portraitBlocker;
    this.onUnlockAudio = onUnlockAudio;
    this.detectTouch();
    this.buildTouchDom();
    this.bindEvents();
    this.updateOrientationGate();
  }

  public isTouchMode(): boolean {
    return this.isTouch;
  }

  private detectTouch(): void {
    const coarsePointer =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const anyFinePointer =
      typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: fine)').matches;
    this.isTouch = detectCoarseTouchPointer({
      coarsePointer,
      anyFinePointer,
      maxTouchPoints: navigator.maxTouchPoints || 0,
    });
  }

  private buildTouchDom(): void {
    this.container.innerHTML = `
      <div class="touch-zone stick-move" data-stick="move"><div class="stick-knob">MOVE</div></div>
      <div class="touch-zone stick-super" data-stick="super"><div class="stick-knob">SUPER</div></div>
      <div class="touch-zone stick-aim" data-stick="aim"><div class="stick-knob">AIM</div></div>
    `;
    this.moveStickEl = this.container.querySelector('.stick-move');
    this.moveKnobEl = this.moveStickEl?.querySelector('.stick-knob') ?? null;
    this.aimStickEl = this.container.querySelector('.stick-aim');
    this.aimKnobEl = this.aimStickEl?.querySelector('.stick-knob') ?? null;
    this.superStickEl = this.container.querySelector('.stick-super');
    this.superKnobEl = this.superStickEl?.querySelector('.stick-knob') ?? null;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.onUnlockAudio();
      const k = e.code;
      this.keys.add(k);
      if (k === 'Space') {
        e.preventDefault();
        this.pendingSuper = true;
      } else if (k === 'KeyQ' || k === 'KeyE') {
        this.pendingAutoAim = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDownLeft = false;
      this.mouseDownRight = false;
    });

    window.addEventListener('pointerdown', (e) => {
      const anyFine =
        typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: fine)').matches;
      if (e.pointerType === 'mouse' && anyFine && this.isTouch) {
        this.isTouch = false;
        this.syncTouchVisibility();
        this.updateOrientationGate();
      } else if (e.pointerType === 'touch' && !this.isTouch) {
        this.isTouch = true;
        this.syncTouchVisibility();
        this.updateOrientationGate();
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.active || this.isTouch) return;
      if ((e.target as HTMLElement)?.closest('button, input, .modal-card')) return;
      this.onUnlockAudio();
      if (e.button === 0) {
        this.mouseDownLeft = true;
        this.pendingFire = true;
      } else if (e.button === 2) {
        this.mouseDownRight = true;
        this.pendingSuper = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownLeft = false;
      if (e.button === 2) this.mouseDownRight = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });

    window.addEventListener('resize', () => {
      this.detectTouch();
      this.updateOrientationGate();
      this.syncTouchVisibility();
    });

    window.addEventListener('orientationchange', () => {
      this.updateOrientationGate();
    });

    // Multi-touch pointer bindings for twin sticks + Super stick
    const bindStick = (
      el: HTMLDivElement | null,
      knob: HTMLDivElement | null,
      state: TouchStickState,
      maxRadius: number,
      onRelease?: (movedDist: number, dx: number, dy: number) => void,
    ) => {
      if (!el || !knob) return;
      el.addEventListener('pointerdown', (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.onUnlockAudio();
        el.setPointerCapture(e.pointerId);
        const rect = el.getBoundingClientRect();
        state.pointerId = e.pointerId;
        state.cx = rect.left + rect.width / 2;
        state.cy = rect.top + rect.height / 2;
        state.dx = 0;
        state.dy = 0;
        state.movedDist = 0;
        state.active = true;
        this.updateStickVector(state, knob, e.clientX, e.clientY, maxRadius);
      });

      el.addEventListener('pointermove', (e) => {
        if (state.pointerId !== e.pointerId) return;
        e.preventDefault();
        this.updateStickVector(state, knob, e.clientX, e.clientY, maxRadius);
      });

      const end = (e: PointerEvent) => {
        if (state.pointerId !== e.pointerId) return;
        e.preventDefault();
        const moved = state.movedDist;
        const dx = state.dx;
        const dy = state.dy;
        state.pointerId = null;
        state.dx = 0;
        state.dy = 0;
        state.movedDist = 0;
        state.active = false;
        knob.style.transform = 'translate(0px, 0px)';
        onRelease?.(moved, dx, dy);
      };

      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };

    bindStick(this.moveStickEl, this.moveKnobEl, this.moveStick, 42);
    bindStick(this.aimStickEl, this.aimKnobEl, this.aimStick, 42, (moved) => {
      if (moved < 12) {
        this.pendingAutoAim = true;
      } else {
        this.pendingFire = true;
      }
    });
    bindStick(this.superStickEl, this.superKnobEl, this.superStick, 30, (moved) => {
      if (moved < 10) {
        this.pendingAutoAim = true;
        this.pendingSuper = true;
      } else {
        this.pendingSuper = true;
      }
    });
  }

  private updateStickVector(
    state: TouchStickState,
    knob: HTMLDivElement,
    clientX: number,
    clientY: number,
    maxRadius: number,
  ): void {
    const rawX = clientX - state.cx;
    const rawY = clientY - state.cy;
    const dist = Math.hypot(rawX, rawY);
    state.movedDist = Math.max(state.movedDist, dist);
    const clamped = Math.min(maxRadius, dist);
    const nx = dist > 0.01 ? rawX / dist : 0;
    const ny = dist > 0.01 ? rawY / dist : 0;
    state.dx = nx * (clamped / maxRadius);
    state.dy = ny * (clamped / maxRadius);
    knob.style.transform = `translate(${(nx * clamped).toFixed(1)}px, ${(ny * clamped).toFixed(1)}px)`;
  }

  public setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.keys.clear();
      this.mouseDownLeft = false;
      this.mouseDownRight = false;
      this.pendingFire = false;
      this.pendingSuper = false;
      this.pendingAutoAim = false;
    }
    this.syncTouchVisibility();
    this.updateOrientationGate();
  }

  private syncTouchVisibility(): void {
    if (this.active && this.isTouch) {
      this.container.classList.remove('hidden');
    } else {
      this.container.classList.add('hidden');
    }
  }

  public updateOrientationGate(): void {
    const isPortraitMobile = this.isTouch && window.innerHeight > window.innerWidth;
    if (isPortraitMobile) {
      this.portraitBlocker.classList.remove('hidden');
    } else {
      this.portraitBlocker.classList.add('hidden');
    }
  }

  public sampleInput(
    state: MatchState,
    localSlot: number,
    screenToWorld: (x: number, y: number) => { x: number; y: number } | null,
  ): { input: PlayerInput; telegraph: AimTelegraphInput | null } {
    const me = state.brawlers[localSlot];
    const team: Team = me ? me.team : 'blue';

    if (this.superStickEl && me) {
      this.superStickEl.classList.toggle('ready', me.superCharge >= 100);
    }

    // Screen-space movement vector
    let sx = 0;
    let sy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) sy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) sy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) sx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) sx += 1;

    if (this.moveStick.active) {
      sx = this.moveStick.dx;
      sy = this.moveStick.dy;
    }

    const sLen = Math.hypot(sx, sy);
    if (sLen > 1) {
      sx /= sLen;
      sy /= sLen;
    }

    const worldMove = screenDirToWorldDir(sx, sy, team);

    // Aim angle
    let aimAngle = this.lastAimAngle;
    let telegraph: AimTelegraphInput | null = null;
    const cfg = me ? BRAWLERS[me.brawlerId] : null;

    if (this.isTouch) {
      if (this.superStick.active && Math.hypot(this.superStick.dx, this.superStick.dy) > 0.18) {
        aimAngle = screenAimToWorldAngle(this.superStick.dx, this.superStick.dy, team);
        this.lastAimAngle = aimAngle;
        if (me && cfg && me.alive) {
          telegraph = { active: true, isSuper: true, x: me.x, y: me.y, angle: aimAngle, spec: cfg.superAttack };
        }
      } else if (this.aimStick.active && Math.hypot(this.aimStick.dx, this.aimStick.dy) > 0.18) {
        aimAngle = screenAimToWorldAngle(this.aimStick.dx, this.aimStick.dy, team);
        this.lastAimAngle = aimAngle;
        if (me && cfg && me.alive) {
          telegraph = { active: true, isSuper: false, x: me.x, y: me.y, angle: aimAngle, spec: cfg.attack };
        }
      }
    } else if (me && me.alive) {
      const worldPt = screenToWorld(this.mouseX, this.mouseY);
      if (worldPt) {
        aimAngle = Math.atan2(worldPt.y - me.y, worldPt.x - me.x);
        this.lastAimAngle = aimAngle;
      }
      if (cfg) {
        const superPreview = this.mouseDownRight && me.superCharge >= 100;
        telegraph = {
          active: true,
          isSuper: superPreview,
          x: me.x,
          y: me.y,
          angle: aimAngle,
          spec: superPreview ? cfg.superAttack : cfg.attack,
        };
      }
    }

    const fire = this.pendingFire || (!this.isTouch && this.mouseDownLeft);
    const superFire = this.pendingSuper;
    const autoAim = this.pendingAutoAim;
    this.pendingFire = false;
    this.pendingSuper = false;
    this.pendingAutoAim = false;

    return {
      input: {
        moveX: worldMove.x,
        moveY: worldMove.y,
        aimAngle,
        fire,
        superFire,
        autoAim,
      },
      telegraph,
    };
  }
}
