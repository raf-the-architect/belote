/* ============================================================================
 * Serveur Belote Tunisie — HTTP (Vite en dev, statique en prod) + WebSocket.
 * Lancement : npm run dev   (http://localhost:3000)
 * ==========================================================================*/

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, RoomInfo, ServerMessage } from '../src/net/protocol';
import { Room, type RoomPlayer } from '../src/net/room';
import type { BotLevel } from '../src/game/types';
import { SUITS } from '../src/game/types';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const DEV = process.env.NODE_ENV !== 'production';
const root = fileURLToPath(new URL('..', import.meta.url));

const rooms = new Map<string, Room>();
const byPlayer = new Map<string, { room: Room; player: RoomPlayer }>();

function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  return `R${rooms.size}`;
}

let nextId = 1;
const makeId = () => `p${nextId++}-${Math.random().toString(36).slice(2, 8)}`;

/* ---------------------------------------------------------------- handlers -- */

function handle(client: WebSocket, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    return;
  }
  const send = (m: ServerMessage) => {
    if (client.readyState === 1) client.send(JSON.stringify(m));
  };

  switch (msg.t) {
    case 'create': {
      const code = makeCode();
      const room = new Room(code);
      rooms.set(code, room);
      const id = makeId();
      const player: RoomPlayer = {
        id, name: clean(msg.name), seat: null, ready: false, connected: true, isBot: false,
        level: (msg.level ?? 'normal') as BotLevel, lastSeen: Date.now(), send,
      };
      if (msg.target) room.target = msg.target;
      room.add(player);
      byPlayer.set(id, { room, player });
      (client as unknown as { _pid?: string })._pid = id;
      send({ t: 'welcome', playerId: id, code, you: room.info().players.find((p) => p.id === id)! });
      room.broadcastRoom();
      break;
    }
    case 'join': {
      const room = rooms.get(msg.code.toUpperCase().trim());
      if (!room) return send({ t: 'error', message: 'Salle introuvable. Vérifiez le code.' });
      if (room.info().started) return send({ t: 'error', message: 'Cette partie a déjà commencé.' });
      if (room.players.filter((p) => !p.isBot).length >= 4) return send({ t: 'error', message: 'La salle est complète.' });
      const id = makeId();
      const player: RoomPlayer = {
        id, name: clean(msg.name), seat: null, ready: false, connected: true, isBot: false,
        level: room.level, lastSeen: Date.now(), send,
      };
      room.add(player);
      byPlayer.set(id, { room, player });
      (client as unknown as { _pid?: string })._pid = id;
      send({ t: 'welcome', playerId: id, code: room.code, you: room.info().players.find((p) => p.id === id)! });
      room.broadcastRoom();
      if (room.state) room.broadcastViews();
      break;
    }
    case 'resume': {
      const room = rooms.get(msg.code.toUpperCase().trim());
      const entry = room?.players.find((p) => p.id === msg.playerId);
      if (!room || !entry) return send({ t: 'error', message: 'Session expirée.' });
      entry.connected = true;
      entry.send = send;
      entry.isBot = false;
      byPlayer.set(entry.id, { room, player: entry });
      (client as unknown as { _pid?: string })._pid = entry.id;
      send({ t: 'welcome', playerId: entry.id, code: room.code, you: room.info().players.find((p) => p.id === entry.id)! });
      room.broadcastRoom();
      if (room.state) room.broadcastViews();
      break;
    }
    case 'ready': {
      const entry = ctx(client);
      entry?.room.setReady(entry.player.id, msg.ready);
      break;
    }
    case 'level': {
      const entry = ctx(client);
      if (entry && entry.room.hostId === entry.player.id) {
        entry.room.level = msg.level;
        entry.room.broadcastRoom();
      }
      break;
    }
    case 'target': {
      const entry = ctx(client);
      if (entry && entry.room.hostId === entry.player.id) {
        entry.room.target = msg.target;
        entry.room.broadcastRoom();
      }
      break;
    }
    case 'start': {
      const entry = ctx(client);
      entry?.room.start(entry.player.id);
      break;
    }
    case 'restart': {
      const entry = ctx(client);
      entry?.room.restart(entry.player.id);
      break;
    }
    case 'action': {
      const entry = ctx(client);
      entry?.room.applyAction(entry.player.id, msg.action);
      break;
    }
    case 'nextHand': {
      const entry = ctx(client);
      entry?.room.nextHand(entry.player.id);
      break;
    }
    case 'chat': {
      const entry = ctx(client);
      if (entry && msg.text.trim()) entry.room.chat(entry.player.id, msg.text.trim());
      break;
    }
    case 'ping': {
      send({ t: 'pong' });
      break;
    }
  }
}

function ctx(client: WebSocket): { room: Room; player: RoomPlayer } | null {
  const id = (client as unknown as { _pid?: string })._pid;
  if (!id) return null;
  return byPlayer.get(id) ?? null;
}

function clean(name: string): string {
  const n = (name ?? '').replace(/[<>]/g, '').trim().slice(0, 16);
  return n || `Joueur ${Math.floor(Math.random() * 90 + 10)}`;
}

/* -------------------------------------------------------------------- HTTP -- */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function viteMiddleware(): Promise<((req: IncomingMessage, res: ServerResponse, next: () => void) => void) | null> {
  try {
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({ server: { middlewareMode: true, hmr: { port: PORT + 1 } }, appType: 'spa' });
    return vite.middlewares as unknown as (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
  } catch (err) {
    console.error('[belote] Vite indisponible :', err);
    return null;
  }
}

const http = createServer();
const wss = new WebSocketServer({ noServer: true });

http.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (client) => wss.emit('connection', client, req));
});

wss.on('connection', (client) => {
  client.on('message', (data) => handle(client, String(data)));
  client.on('close', () => {
    const entry = ctx(client);
    if (entry) entry.room.remove(entry.player.id);
    if (entry) byPlayer.delete(entry.player.id);
  });
  client.on('error', () => {});
});

/* Points d'entrée HTTP ------------------------------------------------ */

let mw: ((req: IncomingMessage, res: ServerResponse, next: () => void) => void) | null = null;

http.on('request', async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: byPlayer.size }));
    return;
  }
  if (url === '/api/rooms') {
    const list = [...rooms.values()].filter((r) => !r.info().started).map((r) => r.info());
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }

  if (DEV) {
    if (!mw) mw = await viteMiddleware();
    if (mw) return mw(req, res, () => {
      res.writeHead(404);
      res.end('Not found');
    });
  }

  // production : fichiers statiques de dist/
  const dist = join(root, 'dist');
  const safe = normalize(url).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, safe === '/' ? 'index.html' : safe);
  if (!existsSync(file)) file = join(dist, 'index.html');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.isEmpty()) {
      room.destroy();
      rooms.delete(code);
    }
  }
}, 60_000).unref?.();

http.listen(PORT, HOST, () => {
  console.log(`\n  ♥ Belote Tunisie — http://localhost:${PORT}\n  mode ${DEV ? 'développement' : 'production'} · ${SUITS.length} couleurs · 32 cartes\n`);
});
