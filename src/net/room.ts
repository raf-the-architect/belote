/* ============================================================================
 * Salles de jeu multijoueur — logique autoritaire.
 * Le moteur tourne côté serveur ; les clients n'envoient que des intentions.
 * ==========================================================================*/

import type { Action, BotLevel, GameState, Seat } from '../game/types';
import { SEATS, SUITS, TEAM_OF } from '../game/types';
import {
  applyAction as engineApply, awaitingCollect, collectTrick, createMatch, nextToPlay, redealHand, startHand,
} from '../game/engine';
import { botContractDecision, botPlay } from '../game/bots';
import { buildView } from '../game/views';
import type { RoomInfo, RoomPlayerInfo, ServerMessage } from './protocol';

export interface Transport {
  id: string;
  send(msg: ServerMessage): void;
}

export interface RoomPlayer extends Transport {
  name: string;
  seat: Seat | null;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  level: BotLevel;
  /** dernière action humaine reçue */
  lastSeen: number;
}

const BOT_NAMES = ['Sami', 'Leïla', 'Karim', 'Nadia', 'Hédi', 'Salma', 'Bilel', 'Emna'];
const TURN_DELAY = 900;   // temps de réflexion simulé
const AUTO_DELAY = 22000;  // délai avant jeu automatique d'un joueur inactif
const COLLECT_DELAY = 950;
const NEXT_HAND_DELAY = 7000;

export class Room {
  code: string;
  players: RoomPlayer[] = [];
  state: GameState | null = null;
  hostId: string | null = null;
  target = 1001;
  level: BotLevel = 'normal';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seed = Math.floor(Math.random() * 1e9);
  private turnStartedAt = Date.now();

  constructor(code: string) {
    this.code = code;
  }

  /* -------------------------------------------------------------- joueurs -- */
  add(player: RoomPlayer): void {
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this.assignSeat(player);
    this.broadcastRoom();
  }

  private assignSeat(player: RoomPlayer): void {
    if (this.state) return;
    const taken = new Set(this.players.filter((p) => p !== player && p.seat !== null).map((p) => p.seat));
    const free = SEATS.filter((s) => !taken.has(s));
    player.seat = free.length ? free[0] : null;
  }

  remove(id: string): void {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    p.connected = false;
    if (!p.isBot) {
      p.name = `${p.name} (déconnecté)`;
    }
    if (this.hostId === id) {
      const next = this.players.find((x) => !x.isBot && x.connected);
      this.hostId = next?.id ?? null;
    }
    this.broadcastRoom();
    // un bot prend le relais pour que la partie continue
    if (this.state && p.seat !== null && !p.isBot) {
      p.isBot = true;
      p.level = this.level;
      this.pump();
    }
  }

  setReady(id: string, ready: boolean): void {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    p.ready = ready;
    this.broadcastRoom();
  }

  seatOf(id: string): Seat | null {
    return this.players.find((p) => p.id === id)?.seat ?? null;
  }

  info(): RoomInfo {
    return {
      code: this.code,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, seat: p.seat, ready: p.ready, connected: p.connected, isBot: p.isBot, level: p.level,
      })),
      hostId: this.hostId,
      started: !!this.state,
      target: this.target,
      level: this.level,
      seatsFree: SEATS.filter((s) => !this.players.some((p) => p.seat === s && !p.isBot)).length,
    };
  }

  /* ---------------------------------------------------------------- partie -- */
  start(id: string): void {
    if (this.state) return;
    if (this.hostId && id !== this.hostId) return;
    // remplir les sièges vides avec des bots
    const names: [string, string, string, string] = ['', '', '', ''];
    const kinds: ('human' | 'bot' | 'remote')[] = ['bot', 'bot', 'bot', 'bot'];
    const levels: (BotLevel | null)[] = [null, null, null, null];
    const bots = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (const s of SEATS) {
      const p = this.players.find((x) => x.seat === s && !x.isBot);
      if (p) {
        names[s] = p.name;
        kinds[s] = 'remote';
        levels[s] = null;
      } else {
        names[s] = bots.pop() ?? `Bot ${s + 1}`;
        kinds[s] = 'bot';
        levels[s] = this.level;
      }
    }
    for (const s of SEATS) {
      if (!this.players.some((p) => p.seat === s)) {
        const bot: RoomPlayer = {
          id: `bot-${this.code}-${s}`,
          name: names[s],
          seat: s,
          ready: true,
          connected: true,
          isBot: true,
          level: this.level,
          lastSeen: Date.now(),
          send: () => {},
        };
        this.players.push(bot);
      }
    }
    this.state = createMatch({ seed: this.seed, target: this.target, level: this.level, names, kinds, levels });
    startHand(this.state);
    this.broadcastRoom();
    this.broadcastViews();
    this.pump();
  }

  /** Relance un match terminé avec les mêmes joueurs et réglages (hôte seulement). */
  restart(id: string): void {
    if (!this.state || this.state.phase !== 'matchOver') return;
    if (this.hostId && id !== this.hostId) {
      const p = this.players.find((x) => x.id === id && !x.isBot);
      p?.send({ t: 'error', message: 'Seul l’hôte peut relancer le match.' });
      return;
    }
    this.seed = Math.floor(Math.random() * 1e9);
    this.state = null;
    for (const p of this.players) if (p.isBot) p.level = this.level;
    this.start(id);
  }

  applyAction(id: string, action: Action): void {
    if (!this.state) return;
    const seat = this.seatOf(id);
    if (seat === null) return;
    const player = this.players.find((p) => p.id === id);
    if (player) player.lastSeen = Date.now();
    if (this.state.phase === 'contract') {
      if (this.state.contract?.turn !== seat) return;
      if (!engineApply(this.state, seat, action)) return;
    } else if (this.state.phase === 'playing') {
      if (nextToPlay(this.state) !== seat) return;
      if (!engineApply(this.state, seat, action)) return;
    } else {
      return;
    }
    this.afterChange();
  }

  nextHand(id: string): void {
    const seat = this.seatOf(id);
    if (seat === null || !this.state) return;
    if (this.state.phase === 'handOver') this.advance();
  }

  private isBotSeat(seat: Seat): boolean {
    const p = this.players.find((x) => x.seat === seat);
    return !p || p.isBot || !p.connected;
  }

  private botFor(seat: Seat): RoomPlayer | null {
    return this.players.find((p) => p.seat === seat && p.isBot) ?? null;
  }

  private afterChange(): void {
    if (!this.state) return;
    if (this.state.pendingRedeal) {
      this.state.pendingRedeal = false;
      redealHand(this.state);
    }
    if (awaitingCollect(this.state)) {
      this.timer = setTimeout(() => {
        if (!this.state) return;
        collectTrick(this.state);
        this.afterChange();
      }, COLLECT_DELAY);
      this.broadcastViews();
      return;
    }
    this.broadcastViews();
    this.pump();
  }

  private pump(): void {
    if (this.timer) clearTimeout(this.timer);
    const st = this.state;
    if (!st) return;
    if (st.phase === 'contract') {
      const seat = st.contract!.turn;
      const p = this.players.find((x) => x.seat === seat);
      const delay = this.isBotSeat(seat) ? TURN_DELAY : AUTO_DELAY;
      const elapsed = Date.now() - this.turnStartedAt;
      this.turnStartedAt = Date.now();
      this.timer = setTimeout(() => this.actFor(seat), this.isBotSeat(seat) ? TURN_DELAY : Math.max(200, delay - elapsed));
      return;
    }
    if (st.phase === 'playing') {
      const seat = nextToPlay(st);
      if (seat === null) return;
      const elapsed = Date.now() - this.turnStartedAt;
      this.turnStartedAt = Date.now();
      if (this.isBotSeat(seat)) {
        this.timer = setTimeout(() => this.actFor(seat), TURN_DELAY);
      } else {
        this.timer = setTimeout(() => this.actFor(seat, true), Math.max(300, AUTO_DELAY - elapsed));
      }
      return;
    }
    if (st.phase === 'handOver') {
      this.timer = setTimeout(() => this.advance(), NEXT_HAND_DELAY);
      return;
    }
    if (st.phase === 'matchOver') return;
  }

  /** Fait jouer un siège : bot, joueur déconnecté ou joueur inactif (auto). */
  private actFor(seat: Seat, auto = false): void {
    const st = this.state;
    if (!st) return;
    const player = this.players.find((p) => p.seat === seat);
    const level: BotLevel = player?.isBot ? player.level : this.level;
    if (st.phase === 'contract') {
      const action = botContractDecision(st, seat, level);
      if (engineApply(st, seat, action)) this.afterChange();
      return;
    }
    if (st.phase === 'playing') {
      const card = botPlay(st, seat, auto ? 'expert' : level);
      if (engineApply(st, seat, { type: 'play', card })) this.afterChange();
    }
  }

  private advance(): void {
    const st = this.state;
    if (!st) return;
    if (st.phase === 'handOver') {
      startHand(st);
      this.broadcastViews();
      this.pump();
    } else if (st.phase === 'matchOver') {
      this.broadcastViews();
    }
  }

  /* ------------------------------------------------------------- émission -- */
  broadcastRoom(): void {
    const info = this.info();
    for (const p of this.players) if (!p.isBot && p.connected) p.send({ t: 'room', room: info });
  }

  broadcastViews(): void {
    const st = this.state;
    if (!st) return;
    for (const p of this.players) {
      if (p.isBot || !p.connected || p.seat === null) continue;
      p.send({ t: 'view', view: buildView(st, p.seat) });
    }
  }

  chat(id: string, text: string): void {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    const clean = text.slice(0, 160);
    for (const q of this.players) if (!q.isBot && q.connected) q.send({ t: 'chat', from: p.name, text: clean, at: Date.now() });
  }

  isEmpty(): boolean {
    return !this.players.some((p) => p.connected && !p.isBot);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
