import { generateRoomCode, isValidRoomCode } from './roomCode';
import { RoomDurableObject } from './roomDo';

export { RoomDurableObject };

export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS?: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
