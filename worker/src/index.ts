import { BrawlerId, MatchRewardRequest } from '@brawl-arena/shared';
import { generateRoomCode, isValidRoomCode } from './roomCode';
import { RoomDurableObject } from './roomDo';
import { ShopRepository } from './shopDb';

export { RoomDurableObject };

export interface Env {
  ROOMS: DurableObjectNamespace;
  DB?: D1Database;
  ASSETS?: Fetcher;
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ---- Cloudflare D1 Shop & Player Profile API ----
    if (url.pathname.startsWith('/api/profile') || url.pathname.startsWith('/api/shop/') || url.pathname === '/api/match/reward') {
      if (!env.DB) {
        return jsonError('D1 database binding (DB) not configured', 503);
      }
      const repo = new ShopRepository(env.DB);
      try {
        if (request.method === 'GET' && url.pathname === '/api/profile') {
          const playerId = url.searchParams.get('playerId') ?? '';
          const name = url.searchParams.get('name') ?? undefined;
          const profile = await repo.getProfile(playerId, name);
          return Response.json({ profile });
        }

        if (request.method === 'POST' && url.pathname === '/api/shop/buy') {
          const body = (await request.json()) as { playerId?: string; itemId?: string };
          const profile = await repo.buyItem(body.playerId ?? '', body.itemId ?? '');
          return Response.json({ profile });
        }

        if (request.method === 'POST' && url.pathname === '/api/shop/equip') {
          const body = (await request.json()) as {
            playerId?: string;
            category?: 'skin' | 'ring';
            itemId?: string | null;
            brawlerId?: BrawlerId;
          };
          const profile = await repo.equipItem(
            body.playerId ?? '',
            body.category === 'ring' ? 'ring' : 'skin',
            body.itemId ?? null,
            body.brawlerId,
          );
          return Response.json({ profile });
        }

        if (request.method === 'POST' && url.pathname === '/api/shop/daily') {
          const body = (await request.json()) as { playerId?: string };
          const profile = await repo.claimDaily(body.playerId ?? '');
          return Response.json({ profile });
        }

        if (request.method === 'POST' && url.pathname === '/api/shop/box') {
          const body = (await request.json()) as { playerId?: string };
          const result = await repo.openBrawlBox(body.playerId ?? '');
          return Response.json(result);
        }

        if (request.method === 'POST' && url.pathname === '/api/match/reward') {
          const body = (await request.json()) as Partial<MatchRewardRequest>;
          const result = await repo.grantMatchReward({
            playerId: body.playerId ?? '',
            name: body.name,
            mode: body.mode === 'brawl-ball' ? 'brawl-ball' : 'gem-grab',
            outcome: body.outcome === 'victory' || body.outcome === 'draw' ? body.outcome : 'defeat',
            kills: Number(body.kills ?? 0),
            objectives: Number(body.objectives ?? 0),
            isStarPlayer: Boolean(body.isStarPlayer),
          });
          return Response.json(result);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Shop request failed';
        return jsonError(message, 400);
      }
    }

    // POST /api/rooms -> allocate an unused 4-char unambiguous room code
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = generateRoomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch(`https://room.internal/status?code=${code}`);
        const data = (await res.json()) as { active: boolean };
        if (!data.active) {
          return Response.json({ code });
        }
      }
      return Response.json({ code: generateRoomCode() });
    }

    // GET /ws/room/:code -> upgrade WebSocket to RoomDurableObject
    const wsMatch = url.pathname.match(/^\/ws\/room\/([A-Za-z0-9]{4})$/);
    if (wsMatch) {
      const code = wsMatch[1].toUpperCase();
      if (!isValidRoomCode(code)) {
        return new Response('Invalid room code', { status: 400 });
      }
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const forwardUrl = new URL(request.url);
      forwardUrl.searchParams.set('code', code);
      return stub.fetch(new Request(forwardUrl.toString(), request));
    }

    // Serve static frontend assets via Cloudflare Workers [assets]
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Brawl Arena API Worker running', { status: 200 });
  },
};
