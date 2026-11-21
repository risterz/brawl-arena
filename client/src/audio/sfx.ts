import { MatchEvent } from '@brawl-arena/shared';

export class SfxEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainPeak: number,
    delay = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playSuperReady(): void {
    if (this.muted) return;
    this.tone(587, 880, 0.14, 'triangle', 0.13, 0);
    this.tone(880, 1175, 0.2, 'sine', 0.14, 0.08);
  }

  public playEvent(event: MatchEvent): void {
    if (this.muted) return;

    if (event.type === 'attack') {
      const boost = event.isSuper ? 1.45 : 1.0;
      if (event.brawlerId === 'buck') {
        this.tone(170 * boost, 52, 0.16, 'sawtooth', 0.14);
      } else if (event.brawlerId === 'vex') {
        this.tone(980, 280, 0.14, 'triangle', 0.12);
      } else if (event.brawlerId === 'blaze') {
        this.tone(540, 220, 0.08, 'square', 0.08);
      } else if (event.brawlerId === 'golem') {
        this.tone(140, 48, 0.15, 'triangle', 0.16);
      } else if (event.brawlerId === 'mort') {
        this.tone(360, 620, 0.15, 'sine', 0.11);
      } else if (event.brawlerId === 'lumi') {
        this.tone(440, 660, 0.16, 'triangle', 0.1);
        if (event.isSuper) this.tone(554, 880, 0.24, 'sine', 0.12, 0.04);
      }
      if (event.isSuper) {
        this.tone(240, 760, 0.22, 'sawtooth', 0.09);
      }
    } else if (event.type === 'gem_pickup') {
      this.tone(660, 990, 0.1, 'sine', 0.11);
      this.tone(990, 1320, 0.12, 'triangle', 0.09, 0.06);
    } else if (event.type === 'wall_break') {
      this.tone(150, 40, 0.24, 'sawtooth', 0.18);
    } else if (event.type === 'kill') {
      this.tone(320, 110, 0.22, 'square', 0.12);
      this.tone(520, 780, 0.14, 'triangle', 0.09, 0.05);
    } else if (event.type === 'countdown_start') {
      this.tone(520, 520, 0.12, 'square', 0.1);
      this.tone(780, 780, 0.18, 'square', 0.1, 0.14);
    } else if (event.type === 'match_end') {
      this.tone(523, 523, 0.14, 'triangle', 0.12, 0);
      this.tone(659, 659, 0.14, 'triangle', 0.12, 0.12);
      this.tone(784, 1046, 0.3, 'triangle', 0.14, 0.24);
    }
  }
}
