import {
  BotController,
  BRAWLER_LIST,
  BrawlerId,
  BRAWLERS,
  MapId,
  MatchEngine,
  MatchEvent,
  MatchState,
  PlayerInput,
  SlotSetup,
} from '@brawl-arena/shared';

export interface LocalMatchOptions {
  mapId: MapId;
  playerBrawler: BrawlerId;
  playerName: string;
}

export class LocalMatchController {
  private engine: MatchEngine;
  private botAi: BotController;
  public readonly localSlot = 0;

  constructor(opts: LocalMatchOptions) {
    const others = BRAWLER_LIST.filter((b) => b.id !== opts.playerBrawler);
    const slots: SlotSetup[] = [
      {
        slotIndex: 0,
        team: 'blue',
        name: opts.playerName.trim() || 'You',
        isBot: false,
        brawlerId: opts.playerBrawler,
      },
      {
        slotIndex: 1,
        team: 'blue',
        name: `Bot ${others[0].name}`,
        isBot: true,
        brawlerId: others[0].id,
      },
      {
        slotIndex: 2,
        team: 'blue',
        name: `Bot ${others[1].name}`,
        isBot: true,
        brawlerId: others[1].id,
      },
      {
        slotIndex: 3,
        team: 'red',
        name: `Bot ${others[2].name}`,
        isBot: true,
        brawlerId: others[2].id,
      },
      {
        slotIndex: 4,
        team: 'red',
        name: `Bot ${others[3].name}`,
        isBot: true,
        brawlerId: others[3].id,
      },
      {
        slotIndex: 5,
        team: 'red',
        name: `Bot ${others[4].name}`,
        isBot: true,
        brawlerId: others[4].id,
      },
    ];

    this.engine = new MatchEngine({
      mapId: opts.mapId,
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
