import { MatchEvent } from '@brawl-arena/shared';

export type BgmTrack = 'lobby' | 'battle' | 'battle_alt' | 'foundry' | 'countdown' | 'victory';

export type SfxKey =
  | 'buck'
  | 'vex'
  | 'blaze'
  | 'golem'
  | 'mort'
  | 'lumi'
  | 'super_cast'
  | 'super_ready'
  | 'hit'
  | 'heal'
  | 'gem'
  | 'wall_break'
  | 'kill'
  | 'countdown'
  | 'match_end'
  | 'ui_click'
  | 'ui_select';

const BGM_URLS: Record<BgmTrack, string> = {
  lobby: '/audio/bgm_lobby.mp3',
  battle: '/audio/bgm_battle.mp3',
  battle_alt: '/audio/bgm_battle_alt.mp3',
  foundry: '/audio/bgm_foundry.mp3',
  countdown: '/audio/bgm_countdown.mp3',
  victory: '/audio/bgm_victory.mp3',
};

const SFX_URLS: Record<SfxKey, string> = {
  buck: '/audio/sfx_buck.mp3',
  vex: '/audio/sfx_vex.mp3',
  blaze: '/audio/sfx_blaze.mp3',
  golem: '/audio/sfx_golem.mp3',
  mort: '/audio/sfx_mort.mp3',
  lumi: '/audio/sfx_lumi.mp3',
  super_cast: '/audio/sfx_super_cast.mp3',
  super_ready: '/audio/sfx_super_ready.mp3',
  hit: '/audio/sfx_hit.mp3',
  heal: '/audio/sfx_heal.mp3',
  gem: '/audio/sfx_gem.mp3',
  wall_break: '/audio/sfx_wall_break.mp3',
  kill: '/audio/sfx_kill.mp3',
  countdown: '/audio/sfx_countdown.mp3',
  match_end: '/audio/sfx_match_end.mp3',
  ui_click: '/audio/sfx_ui_click.mp3',
  ui_select: '/audio/sfx_ui_select.mp3',
};

const SFX_GAIN: Partial<Record<SfxKey, number>> = {
  buck: 0.42,
  vex: 0.38,
  blaze: 0.30,
  golem: 0.44,
  mort: 0.26,
  lumi: 0.34,
  super_cast: 0.50,
  super_ready: 0.46,
  hit: 0.24,
  heal: 0.32,
  gem: 0.44,
  wall_break: 0.46,
  kill: 0.50,
  countdown: 0.44,
  match_end: 0.52,
  ui_click: 0.32,
  ui_select: 0.28,
};

const BGM_VOLUME = 0.30;

export class SfxEngine {
  private ctx: AudioContext | null = null;
  private sfxMuted = false;
  private bgmMuted = false;
  private unlocked = false;
  private preloading = false;
  private buffers = new Map<SfxKey, AudioBuffer>();
  private rawBytes = new Map<SfxKey, ArrayBuffer>();
  private lastPlayedMs = new Map<SfxKey, number>();

  private bgmElements = new Map<BgmTrack, HTMLAudioElement>();
  private desiredBgm: BgmTrack | null = null;
  private activeBgm: BgmTrack | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.sfxMuted = localStorage.getItem('brawl_arena_sfx_muted') === '1';
        this.bgmMuted = localStorage.getItem('brawl_arena_bgm_muted') === '1';
      } catch {
        // ignore storage restrictions
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  public preload(): void {
    if (this.preloading || typeof window === 'undefined' || typeof fetch === 'undefined') return;
    this.preloading = true;
    const entries = Object.entries(SFX_URLS) as Array<[SfxKey, string]>;
    for (const [key, url] of entries) {
      void fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((buf) => {
          if (!buf) return;
          this.rawBytes.set(key, buf);
          if (this.ctx) {
            void this.decodeKey(key, buf);
          }
        })
        .catch(() => undefined);
    }
  }

  private async decodeKey(key: SfxKey, raw: ArrayBuffer): Promise<void> {
    if (!this.ctx || this.buffers.has(key)) return;
    try {
      const decoded = await this.ctx.decodeAudioData(raw.slice(0));
      this.buffers.set(key, decoded);
    } catch {
      // ignore decode errors on unsupported headless environments
    }
  }

  public unlock(): void {
    this.unlocked = true;
    const ctx = this.ensureContext();
    if (ctx) {
      for (const [key, raw] of this.rawBytes) {
        if (!this.buffers.has(key)) {
          void this.decodeKey(key, raw);
        }
      }
    }
    if (!this.preloading) {
      this.preload();
    }
    this.syncBgmPlayback();
  }

  public setMuted(muted: boolean): void {
    this.setSfxMuted(muted);
  }

  public isMuted(): boolean {
    return this.sfxMuted;
  }

  public setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
    try {
      localStorage.setItem('brawl_arena_sfx_muted', muted ? '1' : '0');
    } catch {
      // ignore
    }
  }

  public isSfxMuted(): boolean {
    return this.sfxMuted;
  }

  public setBgmMuted(muted: boolean): void {
    this.bgmMuted = muted;
    try {
      localStorage.setItem('brawl_arena_bgm_muted', muted ? '1' : '0');
    } catch {
      // ignore
    }
    this.syncBgmPlayback();
  }

  public isBgmMuted(): boolean {
    return this.bgmMuted;
  }

  public playBgm(track: BgmTrack | null): void {
    if (this.desiredBgm === track && this.activeBgm === track && !this.bgmMuted) return;
    this.desiredBgm = track;
    this.syncBgmPlayback();
  }

  private getBgmAudio(track: BgmTrack): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    let audio = this.bgmElements.get(track);
    if (!audio) {
      audio = new Audio(BGM_URLS[track]);
      audio.loop = track !== 'victory';
      audio.preload = 'auto';
      audio.volume = BGM_VOLUME;
      this.bgmElements.set(track, audio);
    }
    return audio;
  }

  private syncBgmPlayback(): void {
    if (typeof window === 'undefined') return;
    // Pause any non-desired tracks
    for (const [track, audio] of this.bgmElements) {
      if (track !== this.desiredBgm || this.bgmMuted || !this.unlocked) {
        if (!audio.paused) {
          audio.pause();
        }
        if (track !== this.desiredBgm) {
          audio.currentTime = 0;
        }
      }
    }

    if (!this.desiredBgm || this.bgmMuted || !this.unlocked) {
      this.activeBgm = null;
      return;
    }

    const audio = this.getBgmAudio(this.desiredBgm);
    if (!audio) return;
    audio.volume = BGM_VOLUME;
    if (audio.paused) {
      if (this.activeBgm !== this.desiredBgm) {
        audio.currentTime = 0;
      }
      void audio
        .play()
        .then(() => {
          this.activeBgm = this.desiredBgm;
        })
        .catch(() => {
          // Will start automatically once user interacts (unlock)
        });
    }
  }

  public playSfx(key: SfxKey, rateJitter = 0, minGapMs = 35): void {
    if (this.sfxMuted) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const prev = this.lastPlayedMs.get(key) ?? -Infinity;
    if (nowMs - prev < minGapMs) return;
    this.lastPlayedMs.set(key, nowMs);

    const ctx = this.ensureContext();
    if (!ctx) return;

    const buffer = this.buffers.get(key);
    if (!buffer) {
      const raw = this.rawBytes.get(key);
      if (raw) {
        void this.decodeKey(key, raw);
      }
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (rateJitter > 0) {
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * rateJitter;
    }
    const gain = ctx.createGain();
    gain.gain.value = SFX_GAIN[key] ?? 0.36;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
  }

  public playSuperReady(): void {
    this.playSfx('super_ready', 0, 200);
  }

  public playUiClick(): void {
    this.playSfx('ui_click', 0.03, 40);
  }

  public playUiSelect(): void {
    this.playSfx('ui_select', 0.04, 40);
  }

  public playEvent(event: MatchEvent): void {
    if (this.sfxMuted) return;

    if (event.type === 'attack') {
      if (event.isSuper) {
        this.playSfx('super_cast', 0.04, 60);
      }
      this.playSfx(event.brawlerId, 0.06, event.brawlerId === 'mort' ? 95 : 45);
    } else if (event.type === 'hit') {
      this.playSfx('hit', 0.08, 45);
    } else if (event.type === 'heal') {
      this.playSfx('heal', 0.04, 140);
    } else if (event.type === 'gem_pickup') {
      this.playSfx('gem', 0.05, 50);
    } else if (event.type === 'ball_kick') {
      if (event.isSuper) {
        this.playSfx('super_cast', 0.05, 60);
      }
      this.playSfx('golem', 0.08, 60);
    } else if (event.type === 'goal') {
      this.playSfx('match_end', 0, 250);
    } else if (event.type === 'wall_break') {
      this.playSfx('wall_break', 0.06, 70);
    } else if (event.type === 'kill') {
      this.playSfx('kill', 0.05, 80);
    } else if (event.type === 'countdown_start') {
      this.playSfx('countdown', 0, 300);
    } else if (event.type === 'match_end') {
      this.playSfx('match_end', 0, 400);
    }
  }
}
