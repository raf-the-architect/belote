/* ============================================================================
 * Moteur Belote Tunisienne
 * ---------------------------------------------------------------------------
 * Machine à états complète et déterministe :
 *   distribution 5 cartes → atout proposé → contrat → 8 plis → décompte.
 * Le moteur ne cache rien : c'est la *vue* (views.ts) qui filtre ce que chaque
 * joueur peut voir. Le serveur en ligne s'appuie sur ce même moteur.
 * ==========================================================================*/

import type {
  Action, BotLevel, Card, GameEvent, GameEventInput, GameState, HandResult, LogEntry, Seat, Suit, TeamId, Trick,
} from './types';
import { RANKS, SEATS, SUITS, TEAM_OF, cardId, partnerOf } from './types';
import {
  BELOTE_BONUS, LAST_TRICK_BONUS, TOTAL_CARD_POINTS, cardPoints, fullDeck, hasBelote, illegalReason,
  isBeloteCard, legalCards, trickPoints, trickWinner,
} from './rules';
import { Rng } from './rng';

export const DEFAULT_MATCH_TARGET = 1001;
/** Seuil du contrat : 82 points sauf main exceptionnelle (8 atouts + 3 As) → 81 */
export const CONTRACT_TARGET = 82;
export const CONTRACT_TARGET_EIGHT_TRUMPS = 81;
/** Bonus du "dedans" : l'adversaire marque 162 + les belotes. */
export const DEDANS_TOTAL = TOTAL_CARD_POINTS + LAST_TRICK_BONUS;

export interface NewMatchOptions {
  seed: number;
  target?: number;
  level?: BotLevel;
  names?: [string, string, string, string];
  kinds?: ('human' | 'bot' | 'remote')[];
  levels?: (BotLevel | null)[];
}

let eventSeq = 1;

function ev(state: GameState, e: GameEventInput): void {
  state.events.push({ ...e, seq: eventSeq++, hand: state.hand } as unknown as import('./types').SequencedEvent);
  if (state.events.length > 60) state.events.splice(0, state.events.length - 60);
}

function log(state: GameState, text: string, kind: LogEntry['kind'] = 'info'): void {
  state.log.push({ hand: state.hand, text, kind });
  if (state.log.length > 120) state.log.splice(0, state.log.length - 120);
}

/* -------------------------------------------------------------------------- */
/* Création d'un match                                                        */
/* -------------------------------------------------------------------------- */

export function createMatch(opts: NewMatchOptions): GameState {
  const state: GameState = {
    seed: opts.seed,
    rngState: opts.seed,
    hand: 0,
    phase: 'dealing',
    dealer: 3,
    hands: [[], [], [], []],
    trump: null,
    contract: null,
    playing: false,
    trick: null,
    tricks: [],
    talon: [],
    belote: { beloteHolders: [], announced: [], rebeloteAnnounced: [] },
    teamPoints: [0, 0],
    rawPoints: [0, 0],
    declaredSuit: null,
    history: [],
    matchTarget: opts.target ?? DEFAULT_MATCH_TARGET,
    log: [],
    events: [],
    playerNames: opts.names ?? ['Vous', 'Ouest', 'Partenaire', 'Est'],
    playerKind: opts.kinds ?? ['human', 'bot', 'bot', 'bot'],
    playerLevel: opts.levels ?? [null, opts.level ?? 'normal', opts.level ?? 'normal', opts.level ?? 'normal'],
    lastTrick: null,
    pendingRedeal: false,
  };
  return state;
}

/* -------------------------------------------------------------------------- */
/* Distribution                                                               */
/* -------------------------------------------------------------------------- */

function dealHand(state: GameState): void {
  const rng = new Rng(state.rngState);
  const deck = rng.shuffle(fullDeck());
  state.rngState = rng.state;

  state.tricks = [];
  state.belote = { beloteHolders: [], announced: [], rebeloteAnnounced: [] };
  state.rawPoints = [0, 0];
  state.trick = null;
  state.trump = null;
  state.declaredSuit = null;
  state.lastTrick = null;
  state.playing = false;
  state.faceUpSeat = undefined;
  state.pendingRedeal = false;

  state.hands = [[], [], [], []];
  // 5 cartes chacun, une par une, en commençant par le joueur à gauche du donneur
  let idx = 0;
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < 4; i++) {
      const seat = ((state.dealer + 1 + i) % 4) as Seat;
      state.hands[seat].push(deck[idx++]);
    }
  }
  const faceUp = deck[idx++];
  state.talon = deck.slice(idx);
  state.faceUpCard = faceUp;
  state.phase = 'contract';
  state.contract = {
    proposed: faceUp.suit,
    faceUp,
    firstRound: true,
    turn: ((state.dealer + 1) % 4) as Seat,
    passes: [false, false, false, false],
    secondCandidates: [],
  };
  state.contract.taker = undefined;
  ev(state, { kind: 'deal', dealing: { dealer: state.dealer, faceUp } });
  log(state, `Manche ${state.hand} — distribution (donneur : ${state.playerNames[state.dealer]}), carte retournée : ${faceUp.rank}${faceUp.suit}`, 'deal');
}

export function startHand(state: GameState): void {
  state.hand += 1;
  state.dealer = ((state.dealer + 1) % 4) as Seat;
  dealHand(state);
}

/** Le donneur est le premier à parler après un redeal */
export function redealHand(state: GameState): void {
  state.hand += 1;
  log(state, 'Tout le monde a passé : nouvelle donne.', 'deal');
  state.dealer = ((state.dealer + 1) % 4) as Seat;
  dealHand(state);
}

/* -------------------------------------------------------------------------- */
/* Contrat                                                                    */
/* -------------------------------------------------------------------------- */

function completeDealForTake(state: GameState, taker: Seat, suit: Suit, faceCard: Card | null): void {
  const rng = new Rng(state.rngState);
  const talon = rng.shuffle(state.talon);
  state.rngState = rng.state;

  state.trump = suit;
  state.declaredSuit = suit;
  state.contract!.taker = taker;
  state.contract!.trump = suit;
  state.contract!.firstRound = false;
  state.playing = true;
  state.phase = 'playing';

  // 3 cartes de plus pour chacun, en commençant à gauche du donneur.
  // Le preneur reçoit la carte retournée (+2 cartes) — tout le monde finit à 8.
  const fromTalon: Card[] = [];
  let t = 0;
  for (let i = 0; i < 4; i++) {
    const seat = ((state.dealer + 1 + i) % 4) as Seat;
    if (seat === taker) {
      if (faceCard) state.hands[seat].push(faceCard);
      state.hands[seat].push(talon[t++], talon[t++]);
    } else {
      state.hands[seat].push(talon[t++], talon[t++], talon[t++]);
    }
  }
  fromTalon.push(...talon.slice(0, t));
  state.talon = talon.slice(t);

  state.belote = {
    beloteHolders: SEATS.filter((s) => hasBelote(state.hands[s], suit)),
    announced: [],
    rebeloteAnnounced: [],
  };

  // ordre : le preneur ouvre le jeu
  state.trick = { leader: taker, cards: [] };

  ev(state, { kind: 'contract', seat: taker, suit, firstRound: state.contract!.firstRound });
  log(
    state,
    `${state.playerNames[taker]} prend à ${SUIT_FR[suit]} — contrat de 82 points pour ${teamLabelOf(state, TEAM_OF[taker])}.`,
    'contract',
  );
  if (state.belote.beloteHolders.length) {
    log(state, `Belote annoncée par ${state.belote.beloteHolders.map((s) => state.playerNames[s]).join(', ')}.`, 'belote');
  }
}

export const SUIT_FR: Record<Suit, string> = { H: 'Cœur', D: 'Carreau', C: 'Trèfle', S: 'Pique' };

/** Libellé d'une équipe à partir des noms des joueurs (fonctionne en ligne). */
export function teamLabelOf(state: GameState, team: TeamId): string {
  const seats = SEATS.filter((s) => TEAM_OF[s] === team);
  return `${state.playerNames[seats[0]]} & ${state.playerNames[seats[1]]}`;
}

function contractTurnOrder(state: GameState): Seat[] {
  const order: Seat[] = [];
  for (let i = 0; i < 4; i++) order.push(((state.dealer + 1 + i) % 4) as Seat);
  return order;
}

function advanceContractTurn(state: GameState): void {
  const c = state.contract!;
  if (c.firstRound) {
    c.turn = ((c.turn + 1) % 4) as Seat;
    // si on revient au début → deuxième tour
    if (contractTurnOrder(state)[0] === c.turn) {
      c.firstRound = false;
      c.secondCandidates = [];
      state.faceUpSeat = state.dealer; // la carte retournée appartient au donneur
      log(state, `Personne ne prend à ${SUIT_FR[c.proposed]} : deuxième tour, on peut choisir une autre couleur.`, 'contract');
      ev(state, { kind: 'secondRound' });
    }
  }
}

function finishSecondRoundDeal(state: GameState, taker: Seat, suit: Suit): void {
  const rng = new Rng(state.rngState);
  const talon = rng.shuffle(state.talon);
  state.rngState = rng.state;
  // la carte retournée est remise dans le paquet (elle appartient au donneur) :
  // on distribue 3 cartes à chacun.
  const face = state.faceUpCard!;
  const pool = [face, ...talon];
  let t = 0;
  for (let i = 0; i < 4; i++) {
    const seat = ((state.dealer + 1 + i) % 4) as Seat;
    state.hands[seat].push(pool[t++], pool[t++], pool[t++]);
  }
  state.talon = pool.slice(t);
  state.trump = suit;
  state.declaredSuit = suit;
  state.contract!.taker = taker;
  state.contract!.trump = suit;
  state.playing = true;
  state.phase = 'playing';
  state.belote = {
    beloteHolders: SEATS.filter((s) => hasBelote(state.hands[s], suit)),
    announced: [],
    rebeloteAnnounced: [],
  };
  state.trick = { leader: taker, cards: [] };
  ev(state, { kind: 'contract', seat: taker, suit, firstRound: false });
  log(
    state,
    `Deuxième tour : ${state.playerNames[taker]} prend à ${SUIT_FR[suit]}. Contrat de 82 points pour ${teamLabelOf(state, TEAM_OF[taker])}.`,
    'contract',
  );
}

/** Action du contrat pour le siège `seat`. Renvoie true si acceptée. */
export function contractAction(state: GameState, seat: Seat, action: Action): boolean {
  if (state.phase !== 'contract' || !state.contract) return false;
  const c = state.contract;
  if (c.turn !== seat) return false;

  if (action.type === 'accept') {
    if (!c.firstRound) return false;
    completeDealForTake(state, seat, c.proposed, c.faceUp);
    return true;
  }
  if (action.type === 'pass') {
    c.passes[seat] = true;
    log(state, `${state.playerNames[seat]} passe.`, 'contract');
    ev(state, { kind: 'pass', seat, firstRound: c.firstRound });
    const order = contractTurnOrder(state);
    if (c.firstRound) {
      c.turn = order[(order.indexOf(seat) + 1) % 4];
      if (c.turn === order[0]) {
        c.firstRound = false;
        c.secondCandidates = [];
        state.faceUpSeat = state.dealer;
        log(state, `Personne ne prend à ${SUIT_FR[c.proposed]} : deuxième tour, on peut choisir une autre couleur.`, 'contract');
        ev(state, { kind: 'secondRound' });
      }
    } else {
      // deuxième tour : joueur suivant
      const idx = order.indexOf(seat);
      if (idx === 3) {
        state.pendingRedeal = true;
        ev(state, { kind: 'redeal' });
      } else {
        c.turn = order[idx + 1];
      }
    }
    return true;
  }
  if (action.type === 'take') {
    if (c.firstRound) return false; // au premier tour on accepte simplement la couleur proposée
    if (action.suit === c.proposed) return false; // couleur interdite au 2e tour
    c.secondCandidates.push({ seat, suit: action.suit });
    finishSecondRoundDeal(state, seat, action.suit);
    return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Jeu des cartes                                                             */
/* -------------------------------------------------------------------------- */

export function legalFor(state: GameState, seat: Seat): Card[] {
  if (state.phase !== 'playing' || !state.trump || !state.trick) return [];
  if (state.trick.cards.length >= 4) return [];
  if (nextToPlay(state) !== seat) return [];
  return legalCards(state.hands[seat], state.trick.cards, state.trump, seat);
}

export function nextToPlay(state: GameState): Seat | null {
  if (state.phase !== 'playing' || !state.trick) return null;
  if (state.trick.cards.length === 0) return state.trick.leader;
  return state.trick.cards[state.trick.cards.length - 1].seat === undefined
    ? null
    : (((state.trick.cards[state.trick.cards.length - 1].seat + 1) % 4) as Seat);
}

/** true si un pli de 4 cartes attend d'être ramassé (animation) */
export function awaitingCollect(state: GameState): boolean {
  return state.phase === 'playing' && !!state.trick && state.trick.cards.length === 4;
}

export function playCard(state: GameState, seat: Seat, card: Card): boolean {
  if (state.phase !== 'playing' || !state.trump || !state.trick) return false;
  if (state.trick.cards.length >= 4) return false;
  const turn = nextToPlay(state);
  if (turn !== seat) return false;
  if (!legalCards(state.hands[seat], state.trick.cards, state.trump, seat).some((c) => c.id === card.id)) return false;

  const hand = state.hands[seat];
  const i = hand.findIndex((c) => c.id === card.id);
  if (i < 0) return false;
  hand.splice(i, 1);
  state.trick.cards.push({ seat, card });
  ev(state, { kind: 'play', seat, card });

  // Belote / Rebelote
  if (isBeloteCard(card, state.trump) && state.belote.beloteHolders.includes(seat)) {
    const b = state.belote;
    const first = !b.announced.includes(seat);
    if (first) {
      b.announced.push(seat);
      log(state, `BELOTE pour ${state.playerNames[seat]} !`, 'belote');
      ev(state, { kind: 'belote', seat, word: 'BELOTE !' });
    } else if (!b.rebeloteAnnounced.includes(seat)) {
      b.rebeloteAnnounced.push(seat);
      log(state, `REBELOTE pour ${state.playerNames[seat]} !`, 'belote');
      ev(state, { kind: 'belote', seat, word: 'REBELOTE !' });
    }
  }

  if (state.trick.cards.length === 4) {
    const w = trickWinner(state.trick.cards, state.trump);
    state.trick.winner = w;
    state.trick.points = trickPoints(state.trick.cards, state.trump);
  }
  return true;
}

/** Ramasse le pli terminé, met à jour les scores, prépare le pli suivant. */
export function collectTrick(state: GameState): void {
  if (!awaitingCollect(state) || !state.trump || !state.trick) return;
  const t = state.trick;
  const winner = t.winner!;
  state.tricks.push(t);
  state.rawPoints[TEAM_OF[winner]] += t.points ?? 0;
  state.lastTrick = { winner, points: t.points ?? 0, index: state.tricks.length };
  ev(state, { kind: 'trick', seat: winner, points: t.points ?? 0, index: state.tricks.length });
  log(
    state,
    `Pli ${state.tricks.length} : ${state.playerNames[winner]} ramasse ${t.points} points.`,
    'trick',
  );

  if (state.tricks.length === 8) {
    endHand(state);
  } else {
    state.trick = { leader: winner, cards: [] };
  }
}

export function trickPointsOf(state: GameState, t: Trick): number {
  return state.trump ? trickPoints(t.cards, state.trump) : 0;
}

/* -------------------------------------------------------------------------- */
/* Fin de manche et décompte                                                  */
/* -------------------------------------------------------------------------- */

export function declaringThreshold(state: GameState): number {
  return CONTRACT_TARGET;
}

export function endHand(state: GameState): void {
  const trump = state.trump!;
  const taker = state.contract!.taker!;
  const declTeam = TEAM_OF[taker];
  const oppTeam = (1 - declTeam) as TeamId;

  const cards: [number, number] = [0, 0];
  for (const t of state.tricks) {
    cards[TEAM_OF[t.winner!]] += trickPoints(t.cards, trump);
  }

  // dernier pli
  const last = state.tricks[7];
  const lastWinner = last.winner!;
  const lastBonus: [number, number] = [0, 0];
  lastBonus[TEAM_OF[lastWinner]] = LAST_TRICK_BONUS;

  // belote-rebelote : 20 points pour l'équipe qui détient R+D d'atout
  const belote: [number, number] = [0, 0];
  for (const s of state.belote.beloteHolders) belote[TEAM_OF[s]] += BELOTE_BONUS;

  const declPoints = cards[declTeam] + belote[declTeam] + lastBonus[declTeam];
  const succeeded = declPoints >= CONTRACT_TARGET;

  const nous: HandResult['nous'] = {
    cards: cards[0],
    belote: belote[0],
    lastTrick: lastBonus[0],
    dedans: 0,
    total: cards[0] + belote[0] + lastBonus[0],
  };
  const eux: HandResult['eux'] = {
    cards: cards[1],
    belote: belote[1],
    lastTrick: lastBonus[1],
    dedans: 0,
    total: cards[1] + belote[1] + lastBonus[1],
  };

  if (!succeeded) {
    // "dedans" : l'équipe adverse marque 162 + sa propre belote, le déclarant reste à 0.
    const winnerLine = oppTeam === 0 ? nous : eux;
    const loserLine = oppTeam === 0 ? eux : nous;
    winnerLine.dedans = DEDANS_TOTAL;
    winnerLine.total = DEDANS_TOTAL + belote[oppTeam];
    loserLine.dedans = 0;
    loserLine.total = 0;
  }

  state.teamPoints[0] += nous.total;
  state.teamPoints[1] += eux.total;

  const result: HandResult = {
    hand: state.hand,
    trump,
    taker,
    declaringTeam: declTeam,
    contract: succeeded ? 'reussi' : 'dedans',
    nous,
    eux,
    matchNous: state.teamPoints[0],
    matchEux: state.teamPoints[1],
  };
  state.history.push(result);
  state.phase = 'handOver';
  state.rawPoints = cards;
  ev(state, { kind: 'handOver', result });
  log(
    state,
    `Manche ${state.hand} : ${state.playerNames[0]}/${state.playerNames[2]} ${nous.total} — ${state.playerNames[1]}/${state.playerNames[3]} ${eux.total}${succeeded ? '' : ' (dedans !)'}`,
    'score',
  );

  if (state.teamPoints[0] >= state.matchTarget || state.teamPoints[1] >= state.matchTarget) {
    state.winnerTeam = state.teamPoints[0] >= state.teamPoints[1] ? 0 : 1;
    state.phase = 'matchOver';
    ev(state, { kind: 'matchOver', team: state.winnerTeam });
    log(state, `Match remporté par ${teamLabelOf(state, state.winnerTeam)} !`, 'score');
  }
}

export function applyAction(state: GameState, seat: Seat, action: Action): boolean {
  if (state.phase === 'contract') return contractAction(state, seat, action);
  if (state.phase === 'playing') {
    if (action.type !== 'play') return false;
    return playCard(state, seat, action.card);
  }
  return false;
}

export function isDeclaringTeam(state: GameState, seat: Seat): boolean {
  if (!state.contract?.taker) return false;
  return TEAM_OF[seat] === TEAM_OF[state.contract.taker];
}

export function describeIllegal(state: GameState, seat: Seat, card: Card): string | null {
  if (!state.trump || !state.trick) return null;
  return illegalReason(state.hands[seat], state.trick.cards, state.trump, seat, card);
}

export { partnerOf, cardId, SUITS, RANKS, RANKS as ALL_RANKS };
