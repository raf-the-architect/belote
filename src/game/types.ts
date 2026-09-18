/* ============================================================================
 * Belote Tunisienne — Types du domaine
 * ==========================================================================*/

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

/** 0 = Vous (Sud) · 1 = Ouest · 2 = Partenaire (Nord) · 3 = Est */
export type Seat = 0 | 1 | 2 | 3;
export type TeamId = 0 | 1;

export interface Card {
  suit: Suit;
  rank: Rank;
  /** identifiant unique "H-A" — pratique pour React et pour le réseau */
  id: string;
}

export interface TrickCard {
  seat: Seat;
  card: Card;
}

export interface Trick {
  leader: Seat;
  cards: TrickCard[];
  /** pli terminé : gagnant + points ramassés */
  winner?: Seat;
  points?: number;
}

export type Phase = 'lobby' | 'dealing' | 'contract' | 'playing' | 'handOver' | 'matchOver';

export interface ContractCandidate {
  seat: Seat;
  suit: Suit;
}

export interface ContractState {
  /** atout proposé au premier tour (retourné) */
  proposed: Suit;
  /** carte retournée (5 cartes en main) */
  faceUp: Card;
  /** premier tour : 5 cartes distribuées */
  firstRound: boolean;
  /** joueur dont c'est le tour (premier tour) */
  turn: Seat;
  /** équipe du preneur (undefined tant que personne n'a pris) */
  taker?: Seat;
  trump?: Suit;
  passes: boolean[];
  /** deuxième tour : propositions (suit, seat) */
  secondCandidates: ContractCandidate[];
}

export interface BeloteState {
  /** annonces Belote/Rebelote par siège */
  beloteHolders: Seat[];
  announced: Seat[]; // a dit "Belote"
  rebeloteAnnounced: Seat[]; // a dit "Rebelote"
}

export interface HandScoreLine {
  cards: number;
  belote: number;
  lastTrick: number;
  dedans: number;
  total: number;
}

export type ContractResult = 'reussi' | 'dedans' | 'non_pris';

export interface HandResult {
  hand: number;
  trump?: Suit;
  taker?: Seat;
  declaringTeam?: TeamId;
  contract: ContractResult;
  nous: HandScoreLine;
  eux: HandScoreLine;
  matchNous: number;
  matchEux: number;
}

export interface HandHistoryEntry extends HandResult {}

export interface PlayerInfo {
  name: string;
  seat: Seat;
  /** 'human' = joueur local, 'bot' = IA, 'remote' = connecté en ligne */
  kind: 'human' | 'bot' | 'remote';
  level?: BotLevel;
  avatar?: string;
}

export type BotLevel = 'facile' | 'normal' | 'expert';

export interface MatchConfig {
  target: number;
  level: BotLevel;
}

export type GameEvent =
  | { kind: 'deal'; dealing: { dealer: Seat; faceUp: Card } }
  | { kind: 'contract'; seat: Seat; suit: Suit; firstRound: boolean }
  | { kind: 'pass'; seat: Seat; firstRound: boolean }
  | { kind: 'secondRound' }
  | { kind: 'redeal' }
  | { kind: 'play'; seat: Seat; card: Card }
  | { kind: 'trick'; seat: Seat; points: number; index: number }
  | { kind: 'belote'; seat: Seat; word: 'BELOTE !' | 'REBELOTE !' }
  | { kind: 'handOver'; result: HandResult }
  | { kind: 'matchOver'; team: TeamId };

export type SequencedEvent = GameEvent & { seq: number; hand: number };
export type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type GameEventInput = DistributiveOmit<GameEvent, 'seq' | 'hand'>;

export interface GameState {
  seed: number;
  rngState: number;
  hand: number;
  phase: Phase;
  dealer: Seat;
  hands: Card[][];
  /** cartes visibles publiquement (le pli retourné au tout début) */
  faceUpCard?: Card;
  /** siège qui a reçu la carte retournée quand elle est redistribuée (2e tour) */
  faceUpSeat?: Seat;
  /** dernier pli ramassé (pour l'affichage) */
  lastTrick: { winner: Seat; points: number; index: number } | null;
  /** le 2e tour est terminé sans preneur → il faut redistribuer */
  pendingRedeal: boolean;
  events: SequencedEvent[];
  contract: ContractState | null;
  trump: Suit | null;
  playing: boolean;
  trick: Trick | null;
  /** plis terminés, y compris les 5 premières cartes jetées lors de la prise */
  tricks: Trick[];
  talon: Card[];
  belote: BeloteState;
  teamPoints: [number, number];
  rawPoints: [number, number];
  declaredSuit: Suit | null;
  history: HandHistoryEntry[];
  matchTarget: number;
  winnerTeam?: TeamId;
  /** log lisible des évènements de la manche */
  log: LogEntry[];
  /** équipe "Nous" (celle du joueur local) = 0 par convention */
  playerNames: [string, string, string, string];
  playerKind: ('human' | 'bot' | 'remote')[];
  playerLevel: (BotLevel | null)[];
}

export interface LogEntry {
  hand: number;
  text: string;
  kind: 'deal' | 'contract' | 'trick' | 'belote' | 'score' | 'info';
}

export type Action =
  | { type: 'accept' }
  | { type: 'pass' }
  | { type: 'take'; suit: Suit }
  | { type: 'play'; card: Card };

export const SUITS: Suit[] = ['H', 'D', 'C', 'S'];
export const SEATS: Seat[] = [0, 1, 2, 3];
export const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const SUIT_SYMBOL: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
export const SUIT_NAME_FR: Record<Suit, string> = {
  H: 'Cœur',
  D: 'Carreau',
  C: 'Trèfle',
  S: 'Pique',
};
export const SUIT_COLOR: Record<Suit, 'red' | 'black'> = { H: 'red', D: 'red', C: 'black', S: 'black' };
export const RANK_LABEL: Record<Rank, string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'V',
  Q: 'D',
  K: 'R',
  A: 'A',
};

export const TEAM_OF: Record<Seat, TeamId> = { 0: 0, 2: 0, 1: 1, 3: 1 };
export const TEAM_NAME: Record<TeamId, string> = { 0: 'Nous', 1: 'Eux' };
export const SEAT_NAME: Record<Seat, string> = { 0: 'Vous', 1: 'Ouest', 2: 'Partenaire', 3: 'Est' };
export const SEAT_POS: Record<Seat, 'sud' | 'ouest' | 'nord' | 'est'> = {
  0: 'sud',
  1: 'ouest',
  2: 'nord',
  3: 'est',
};

export function cardId(suit: Suit, rank: Rank): string {
  return `${suit}-${rank}`;
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function teamOf(seat: Seat): TeamId {
  return TEAM_OF[seat];
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function opponentOf(seat: Seat): Seat[] {
  return [(seat + 1) % 4 as Seat, (seat + 3) % 4 as Seat];
}
