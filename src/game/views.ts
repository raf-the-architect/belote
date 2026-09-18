/* ============================================================================
 * Vues filtrées : ce que chaque joueur a le droit de voir.
 * Le moteur complet ne quitte jamais le serveur ; les clients reçoivent
 * uniquement l'objet GameView construit ici (main du joueur + informations
 * publiques). Aucun serveur ni client ne peut donc révéler une main cachée.
 * ==========================================================================*/

import type {
  BotLevel, Card, ContractState, HandHistoryEntry, LogEntry, Phase, Seat, Suit, TeamId, Trick, TrickCard,
} from './types';
import { SEATS, TEAM_OF } from './types';
import { legalCards } from './rules';

export interface ViewPlayer {
  seat: Seat;
  name: string;
  kind: 'human' | 'bot' | 'remote';
  level: BotLevel | null;
  cards: number;
  connected: boolean;
}

export interface ViewContract {
  proposed: Suit;
  faceUp: Card;
  firstRound: boolean;
  turn: Seat;
  taker?: Seat;
  trump?: Suit;
  passes: boolean[];
  secondCandidates: { seat: Seat; suit: Suit }[];
}

export interface GameView {
  /** siège du destinataire de la vue */
  you: Seat;
  hand: number;
  phase: Phase;
  dealer: Seat;
  players: ViewPlayer[];
  /** ma main, triée */
  cards: Card[];
  /** ids des cartes jouables maintenant */
  legal: string[];
  /** carte jouée par chaque siège dans le pli courant */
  trick: TrickCard[];
  trickLeader: Seat | null;
  /** vrai si le pli est complet et attend d'être ramassé */
  pendingCollect: boolean;
  trump: Suit | null;
  contract: ViewContract | null;
  /** équipe qui a pris */
  declaringTeam: TeamId | null;
  /** scores absolus par équipe (0 = sièges 0/2, 1 = sièges 1/3) ; le libellé est côté UI */
  scores: [number, number];
  matchTarget: number;
  tricksPlayed: number;
  lastTrick: { winner: Seat; points: number; index: number } | null;
  /** historique des plis terminés (du plus ancien au plus récent) */
  tricks: { winner: Seat; points: number; cards: TrickCard[] }[];
  history: HandHistoryEntry[];
  log: LogEntry[];
  winnerTeam?: TeamId;
  turn: Seat | null;
  /** belote : qui a annoncé */
  belote: { holders: Seat[]; announced: Seat[]; rebelote: Seat[] };
  /** carte retournée remise au donneur (2e tour) */
  faceUpSeat?: Seat;
  target: number;
}

export function buildView(state: GameStateLike, you: Seat): GameView {
  const nextToPlay = (st: GameStateLike): Seat | null => {
    if (st.phase !== 'playing' || !st.trick) return null;
    if (st.trick.cards.length === 0) return st.trick.leader;
    if (st.trick.cards.length >= 4) return null;
    return ((st.trick.cards[st.trick.cards.length - 1].seat + 1) % 4) as Seat;
  };
  const inTrick = new Set<string>();
  if (state.trick) for (const tc of state.trick.cards) inTrick.add(tc.card.id);

  const legal =
    state.phase === 'playing' && state.trump && state.trick && state.trick.cards.length < 4 && nextToPlay(state) === you
      ? legalCards(state.hands[you], state.trick.cards, state.trump, you).map((c) => c.id)
      : [];

  return {
    you,
    hand: state.hand,
    phase: state.phase,
    dealer: state.dealer,
    players: SEATS.map((s) => ({
      seat: s,
      name: state.playerNames[s],
      kind: state.playerKind[s],
      level: state.playerLevel[s],
      cards: state.hands[s].length + (state.trick?.cards.some((tc) => tc.seat === s) ? 1 : 0),
      connected: (state.disconnected ?? []).includes(s) ? false : true,
    })),
    cards: [...state.hands[you]],
    legal,
    trick: state.trick ? state.trick.cards.map((t) => ({ ...t })) : [],
    trickLeader: state.trick ? state.trick.leader : null,
    pendingCollect: state.phase === 'playing' && !!state.trick && state.trick.cards.length === 4,
    trump: state.trump,
    contract: state.contract ? { ...state.contract } : null,
    declaringTeam: state.contract?.taker !== undefined ? TEAM_OF[state.contract.taker] : null,
    scores: [state.teamPoints[0], state.teamPoints[1]],
    matchTarget: state.matchTarget,
    tricksPlayed: state.tricks.length,
    lastTrick: state.lastTrick,
    tricks: state.tricks.map((t: Trick) => ({
      winner: t.winner as Seat,
      points: t.points ?? 0,
      cards: t.cards.map((c) => ({ ...c })),
    })),
    history: state.history,
    log: state.log,
    winnerTeam: state.winnerTeam,
    turn: nextToPlay(state) ?? (state.phase === 'contract' ? state.contract?.turn ?? null : null),
    belote: {
      holders: state.belote.beloteHolders,
      announced: state.belote.announced,
      rebelote: state.belote.rebeloteAnnounced,
    },
    faceUpSeat: state.faceUpSeat,
    target: state.matchTarget,
  };
}

/** Sous-ensemble de GameState nécessaire à la construction d'une vue. */
export interface GameStateLike {
  hand: number;
  phase: Phase;
  dealer: Seat;
  hands: Card[][];
  trick: Trick | null;
  tricks: Trick[];
  trump: Suit | null;
  contract: ContractState | null;
  teamPoints: [number, number];
  matchTarget: number;
  history: HandHistoryEntry[];
  log: LogEntry[];
  winnerTeam?: TeamId;
  lastTrick: { winner: Seat; points: number; index: number } | null;
  belote: { beloteHolders: Seat[]; announced: Seat[]; rebeloteAnnounced: Seat[] };
  faceUpSeat?: Seat;
  playerNames: [string, string, string, string];
  playerKind: ('human' | 'bot' | 'remote')[];
  playerLevel: (BotLevel | null)[];
  disconnected?: Seat[];
}
