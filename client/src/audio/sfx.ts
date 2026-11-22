import { MatchEvent, MatchState } from '@brawl-arena/shared';
import { computePodiumLineup } from '../render/victoryStage';

export type BgmTrack =
  | 'lobby'
  | 'battle'
  | 'battle_alt'
  | 'foundry'
  | 'countdown'
  | 'victory'
  | 'defeat';

export function getMatchResultBgmTrack(state: MatchState, localSlot: number): 'victory' | 'defeat' {
  const lineup = computePodiumLineup(state, localSlot);
  return lineup.outcome === 'victory' ? 'victory' : 'defeat';
}

export type SfxKey =
  | 'buck'
  | 'vex'
  | 'blaze'
  | 'golem'
  | 'mort'
  | 'lumi'
  | 'kage'
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

export const BGM_URLS: Record<BgmTrack, string> = {
  lobby: '/audio/bgm_lobby.mp3',
  battle: '/audio/bgm_battle.mp3',
  battle_alt: '/audio/bgm_battle_alt.mp3',
  foundry: '/audio/bgm_foundry.mp3',
  countdown: '/audio/bgm_countdown.mp3',
  victory: '/audio/bgm_victory.mp3',
  defeat: '/audio/bgm_defeat.mp3',
};

export const SFX_URLS: Record<SfxKey, string> = {
  buck: '/audio/sfx_buck.mp3',
  vex: '/audio/sfx_vex.mp3',
  blaze: '/audio/sfx_blaze.mp3',
  golem: '/audio/sfx_golem.mp3',
  mort: '/audio/sfx_mort.mp3',
  lumi: '/audio/sfx_lumi.mp3',
  kage: '/audio/sfx_kage.mp3',
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
  kage: 0.40,
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
const WEB_AUDIO_PRELOAD_BGM: BgmTrack[] = ['victory', 'defeat'];

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
  private bgmBuffers = new Map<BgmTrack, AudioBuffer>();
  private bgmRawBytes = new Map<BgmTrack, ArrayBuffer>();
  private bgmSourceNode: AudioBufferSourceNode | null = null;
  private bgmSourceTrack: BgmTrack | null = null;
  private bgmGainNode: GainNode | null = null;
  private pendingHtmlTrack: BgmTrack | null = null;
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
    // Preload result tracks (victory & defeat) into Web Audio buffers so they play
    // instantaneously when a match ends with zero browser HTMLAudio autoplay blocks.
    for (const track of WEB_AUDIO_PRELOAD_BGM) {
      void fetch(BGM_URLS[track])
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((buf) => {
          if (!buf) return;
          this.bgmRawBytes.set(track, buf);
          if (this.ctx) {
            void this.decodeBgmTrack(track, buf);
          }
        })
        .catch(() => undefined);
    }
  }

  private async decodeBgmTrack(track: BgmTrack, raw: ArrayBuffer): Promise<void> {
    if (!this.ctx || this.bgmBuffers.has(track)) return;
    try {
      const decoded = await this.ctx.decodeAudioData(raw.slice(0));
      this.bgmBuffers.set(track, decoded);
      if (this.desiredBgm === track && this.unlocked && !this.bgmMuted && this.bgmSourceTrack !== track) {
        this.syncBgmPlayback();
      }
    } catch {
      // fallback to HTMLAudioElement if decodeAudioData fails
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
      for (const [track, raw] of this.bgmRawBytes) {
        if (!this.bgmBuffers.has(track)) {
          void this.decodeBgmTrack(track, raw);
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
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = BGM_VOLUME;
      this.bgmElements.set(track, audio);
    }
    return audio;
  }

  private stopWebAudioBgm(): void {
    if (this.bgmSourceNode) {
      try {
        this.bgmSourceNode.stop();
        this.bgmSourceNode.disconnect();
      } catch {
        // already stopped
      }
      this.bgmSourceNode = null;
    }
    if (this.bgmGainNode) {
      try {
        this.bgmGainNode.disconnect();
      } catch {
        // ignore
      }
      this.bgmGainNode = null;
    }
    this.bgmSourceTrack = null;
  }

  private syncBgmPlayback(): void {
    if (typeof window === 'undefined') return;

    if (!this.desiredBgm || this.bgmMuted || !this.unlocked) {
      this.stopWebAudioBgm();
      this.pendingHtmlTrack = null;
      for (const [track, audio] of this.bgmElements) {
        if (!audio.paused) {
          audio.pause();
        }
        if (track !== this.desiredBgm) {
          audio.currentTime = 0;
        }
      }
      this.activeBgm = null;
      return;
    }

    const desired = this.desiredBgm;
    const decodedBgm = this.bgmBuffers.get(desired);
    const ctx = decodedBgm ? this.ensureContext() : null;

    // Prefer already-unlocked Web Audio buffer playback when decoded (bulletproof for Victory/Defeat!)
    if (decodedBgm && ctx) {
      this.pendingHtmlTrack = null;
      for (const [, audio] of this.bgmElements) {
        if (!audio.paused) {
          audio.pause();
        }
        audio.currentTime = 0;
      }
      if (this.bgmSourceTrack === desired && this.bgmSourceNode && this.bgmGainNode) {
        this.bgmGainNode.gain.value = BGM_VOLUME;
        this.activeBgm = desired;
        return;
      }
      this.stopWebAudioBgm();
      const src = ctx.createBufferSource();
      src.buffer = decodedBgm;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = BGM_VOLUME;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
      this.bgmSourceNode = src;
      this.bgmGainNode = gain;
      this.bgmSourceTrack = desired;
      this.activeBgm = desired;
      return;
    }

    // Streaming HTMLAudioElement playback for longer in-game BGM tracks (or fallback while decoding)
    this.stopWebAudioBgm();
    for (const [track, audio] of this.bgmElements) {
      if (track !== desired) {
        if (!audio.paused) {
          audio.pause();
        }
        audio.currentTime = 0;
      }
    }

    const audio = this.getBgmAudio(desired);
    if (!audio) return;
    audio.volume = BGM_VOLUME;
    if (audio.paused) {
      if (this.pendingHtmlTrack === desired) return;
      if (this.activeBgm !== desired) {
        audio.currentTime = 0;
      }
      this.pendingHtmlTrack = desired;
      void audio
        .play()
        .then(() => {
          if (this.desiredBgm === desired && !this.bgmMuted) {
            this.activeBgm = desired;
          }
        })
        .catch(() => {
          // Will start automatically once user interacts or Web Audio buffer finishes decoding
        })
        .finally(() => {
          if (this.pendingHtmlTrack === desired) {
            this.pendingHtmlTrack = null;
          }
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
    } else if (event.type === 'tackle') {
      if (event.stolen) {
        this.playSfx('hit', 0.06, 40);
        this.playSfx('gem', 0.04, 60);
      } else {
        this.playSfx('golem', 0.12, 60);
      }
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
