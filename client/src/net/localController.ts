import {
  BotController,
  BRAWLER_LIST,
  BrawlerId,
  BRAWLERS,
  GameMode,
  MapId,
  MatchEngine,
  MatchEvent,
  MatchState,
  PlayerInput,
  SlotSetup,
} from '@brawl-arena/shared';

export interface LocalMatchOptions {
  mapId: MapId;
  mode?: GameMode;
  blueSize?: number;
  redSize?: number;
  playerBrawler: BrawlerId;
  playerName: string;
}

export class LocalMatchController {
  private engine: MatchEngine;
  private botAi: BotController;
  public readonly localSlot = 0;

  constructor(opts: LocalMatchOptions) {
    const blueSize = Math.max(1, Math.min(3, Math.floor(opts.blueSize ?? 3)));
    const redSize = Math.max(1, Math.min(3, Math.floor(opts.redSize ?? 3)));
    const others = BRAWLER_LIST.filter((b) => b.id !== opts.playerBrawler);
    const slots: SlotSetup[] = [
      {
        slotIndex: 0,
        team: 'blue',
        name: opts.playerName.trim() || 'You',
        isBot: false,
        brawlerId: opts.playerBrawler,
      },
    ];
    let botCursor = 0;
    for (let i = 1; i < blueSize; i++) {
      const pick = others[botCursor++ % others.length];
      slots.push({
        slotIndex: slots.length,
        team: 'blue',
        name: `Bot ${pick.name}`,
        isBot: true,
        brawlerId: pick.id,
      });
    }
    for (let i = 0; i < redSize; i++) {
      const pick = others[botCursor++ % others.length];
      slots.push({
        slotIndex: slots.length,
        team: 'red',
        name: `Bot ${pick.name}`,
        isBot: true,
        brawlerId: pick.id,
      });
    }

    this.engine = new MatchEngine({
      mapId: opts.mapId,
      mode: opts.mode ?? 'gem-grab',
      slots,
      seed: Date.now() & 0xfffffff,
    });
    this.botAi = new BotController();
  }

  public getState(): MatchState {
    return this.engine.state;
  }

  public tick(dt: number, localInput: PlayerInput): MatchEvent[] {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    const botInputs = this.botAi.computeInputs(this.engine.state, clampedDt);
    for (const [slot, inp] of botInputs) {
      this.engine.setInput(slot, inp);
    }
    this.engine.setInput(this.localSlot, localInput);
    return this.engine.step(clampedDt);
  }

  public getPlayerBrawlerName(): string {
    return BRAWLERS[this.engine.state.brawlers[0].brawlerId].name;
  }
}
