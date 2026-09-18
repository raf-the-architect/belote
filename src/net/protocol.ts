/* ============================================================================
 * Protocole du mode multijoueur (WebSocket, JSON).
 * Toutes les vues envoyées aux clients sont filtrées par src/game/views.ts :
 * un client ne reçoit jamais les mains des autres joueurs.
 * ==========================================================================*/

import type { Action, BotLevel, Seat } from '../game/types';
import type { GameView } from '../game/views';

export interface RoomPlayerInfo {
  id: string;
  name: string;
  seat: Seat | null;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  level: BotLevel;
}

export interface RoomInfo {
  code: string;
  players: RoomPlayerInfo[];
  hostId: string | null;
  started: boolean;
  target: number;
  level: BotLevel;
  seatsFree: number;
}

export type ClientMessage =
  | { t: 'create'; name: string; level?: BotLevel; target?: number }
  | { t: 'join'; code: string; name: string }
  | { t: 'resume'; playerId: string; code: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'level'; level: BotLevel }
  | { t: 'target'; target: number }
  | { t: 'start' }
  | { t: 'restart' }
  | { t: 'action'; action: Action }
  | { t: 'nextHand' }
  | { t: 'chat'; text: string }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'welcome'; playerId: string; code: string; you: RoomPlayerInfo }
  | { t: 'room'; room: RoomInfo }
  | { t: 'view'; view: GameView }
  | { t: 'chat'; from: string; text: string; at: number }
  | { t: 'error'; message: string }
  | { t: 'left' }
  | { t: 'pong' };

export const ROOM_CODE_LENGTH = 4;
