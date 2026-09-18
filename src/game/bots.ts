/* ============================================================================
 * Intelligence artificielle — Belote Tunisienne
 * ---------------------------------------------------------------------------
 * Trois niveaux, une seule vérité : les bots ne voient QUE l'information
 * publique (leurs cartes, les plis joués, le contrat). Ils n'accèdent jamais
 * aux mains cachées.
 *  - facile  : suit les règles, joue le plus bas possible, contrats rares.
 *  - normal  : mémoire des plis, compte les atouts, soutient le partenaire.
 *  - expert  : compte les atouts restants, repère les couleurs sèches,
 *              ne gaspille pas une maîtresse, planifie les derniers plis.
 * ==========================================================================*/

import type { Action, BotLevel, Card, GameState, Seat, Suit } from './types';
import { SEATS, TEAM_OF, partnerOf } from './types';
import {
  LAST_TRICK_BONUS, PLAIN_ORDER, SUITS, TRUMP_ORDER, beats, cardPoints, countPoints, countTrumps, handStrength,
  hasBelote, legalCards, pointStrengthTrump, strength, trickPoints, trickWinner,
} from './rules';
import { SUIT_FR } from './engine';

/* -------------------------------------------------------------------------- */
/* Connaissance du jeu                                                        */
/* -------------------------------------------------------------------------- */

export interface Memory {
  trump: Suit;
  hand: Card[];
  /** cartes déjà tombées, pli courant inclus */
  played: Card[];
  /** cartes non vues par ce joueur */
  unseen: Card[];
  /** atouts non vus */
  trumpsUnseen: number;
  trumpsUnseenHigh: number;
  /** couleur → sièges reconnus secs (repérés en ne fournissant pas) */
  voidIn: Record<Suit, Set<Seat>>;
  /** index du pli en cours (0..7) */
  trickIndex: number;
}

const ALL_CARDS: Card[] = (() => {
  const out: Card[] = [];
  for (const s of SUITS) for (const r of PLAIN_ORDER) out.push({ suit: s, rank: r, id: `${s}-${r}` });
  return out;
})();

export function buildMemory(state: GameState, seat: Seat): Memory {
  const trump = state.trump!;
  const played: Card[] = [];
  for (const t of state.tricks) for (const tc of t.cards) played.push(tc.card);
  if (state.trick) for (const tc of state.trick.cards) played.push(tc.card);

  const playedIds = new Set(played.map((c) => c.id));
  const handIds = new Set(state.hands[seat].map((c) => c.id));
  const unseen = ALL_CARDS.filter((c) => !playedIds.has(c.id) && !handIds.has(c.id));

  const voidIn: Record<Suit, Set<Seat>> = { H: new Set(), D: new Set(), C: new Set(), S: new Set() };
  const markVoids = (cards: { seat: Seat; card: Card }[]) => {
    if (!cards.length) return;
    const led = cards[0].card.suit;
    for (let i = 1; i < cards.length; i++) {
      if (cards[i].card.suit !== led) voidIn[led].add(cards[i].seat);
    }
  };
  for (const t of state.tricks) markVoids(t.cards);
  if (state.trick) markVoids(state.trick.cards);

  const trumpsUnseenArr = unseen.filter((c) => c.suit === trump);
  return {
    trump,
    hand: state.hands[seat],
    played,
    unseen,
    trumpsUnseen: trumpsUnseenArr.length,
    trumpsUnseenHigh: trumpsUnseenArr.filter((c) => strength(c.rank, c.suit, trump) >= strength('9', trump, trump)).length,
    voidIn,
    trickIndex: state.tricks.length,
  };
}

/** La carte est-elle maîtresse (personne, hormis les cartes déjà vues, ne la bat) ? */
export function isMaster(card: Card, mem: Memory): boolean {
  if (mem.unseen.length === 0) return true;
  const best = mem.unseen.reduce<Card | null>((acc, c) => {
    if (!acc) return c;
    return beats(c, acc, mem.trump) ? c : acc;
  }, null);
  if (!best) return true;
  // une carte non vue de la couleur de l'atout bat tout ce qui n'est pas atout
  if (card.suit !== mem.trump && best.suit === mem.trump) return false;
  return !beats(best, card, mem.trump) && !(best.suit === mem.trump && card.suit !== mem.trump);
}

/** Parmi les cartes non vues, y a-t-il une carte de la couleur `suit` ? */
export function suitStillLive(suit: Suit, mem: Memory): boolean {
  return mem.unseen.some((c) => c.suit === suit);
}

/* -------------------------------------------------------------------------- */
/* Décision de contrat                                                        */
/* -------------------------------------------------------------------------- */

interface ContractScore {
  value: number;
  trumps: number;
  hasJack: boolean;
  hasNine: boolean;
}

/** Évaluation d'une main (8 cartes, ou 6 au premier tour) pour un atout donné. */
export function evaluateTrump(hand: Card[], trump: Suit): ContractScore {
  const trumps = hand.filter((c) => c.suit === trump);
  let value = 0;
  const hasJack = trumps.some((c) => c.rank === 'J');
  const hasNine = trumps.some((c) => c.rank === '9');
  for (const t of trumps) value += pointStrengthTrump(t.rank);

  const bySuit: Record<Suit, Card[]> = { H: [], D: [], C: [], S: [] };
  for (const c of hand) if (c.suit !== trump) bySuit[c.suit].push(c);
  for (const s of SUITS) {
    if (s === trump) continue;
    const cs = bySuit[s];
    if (!cs.length) continue;
    const hasAce = cs.some((c) => c.rank === 'A');
    const hasTen = cs.some((c) => c.rank === '10');
    const hasKing = cs.some((c) => c.rank === 'K');
    if (hasAce) value += 3.1;
    if (hasAce && hasTen) value += 1.5; // A-10 : deux maîtresses
    else if (hasTen) value += 1.6;
    if (hasKing) value += 0.9;
    if (cs.some((c) => c.rank === 'J')) value += 0.7;
    if (cs.some((c) => c.rank === 'Q')) value += 0.4;
    // couleur courte : potentiel de coupe
    if (cs.length === 1) value += 0.5;
    if (cs.length === 0) value += 1.4; // coupe sèche
  }
  if (hasJack && hasNine) value += 2.2;
  if (trumps.length >= 5) value += 1.4;
  if (trumps.length >= 6) value += 1.6;
  if (trumps.length >= 8) value += 3;
  const hasK = trumps.some((c) => c.rank === 'K');
  const hasQ = trumps.some((c) => c.rank === 'Q');
  if (hasK && hasQ) value += 1.0; // belote probable
  return { value, trumps: trumps.length, hasJack, hasNine };
}

/** Seuils de prise — ajustables pour la calibration (scripts/calibrate.ts). */
export const BOT_TUNING = {
  firstRoundMin: { facile: 13.4, normal: 13.2, expert: 12.9 } as Record<BotLevel, number>,
  secondRoundMin: { facile: 10.0, normal: 9.6, expert: 9.1 } as Record<BotLevel, number>,
  secondMinTrumps: { facile: 3, normal: 3, expert: 2 } as Record<BotLevel, number>,
  /** seuil plancher du dernier joueur au 2e tour : on évite la redistribution */
  lastChanceFloor: { facile: 7.4, normal: 6.2, expert: 5.2 } as Record<BotLevel, number>,
  /** réduction du seuil quand le bot est le dernier à pouvoir parler */
  lastChanceRelief: { facile: 1.2, normal: 1.8, expert: 2.4 } as Record<BotLevel, number>,
  /** bruit appliqué à l'évaluation (facile = imprévisible) */
  noise: { facile: 1.6, normal: 0.45, expert: 0.0 } as Record<BotLevel, number>,
};

/** Décision de contrat du bot pour le siège `seat`. */
export function botContractDecision(state: GameState, seat: Seat, level: BotLevel): Action {
  const c = state.contract!;
  const hand = state.hands[seat];
  const noise = BOT_TUNING.noise[level];
  const jitter = () => (Math.random() - 0.5) * 2 * noise;

  if (c.firstRound) {
    const withCard = [...hand, c.faceUp];
    const ev = evaluateTrump(withCard, c.faceUp.suit);
    // au 1er tour, le preneur ramasse la carte retournée : ~6 cartes décident
    let need = BOT_TUNING.firstRoundMin[level];
    // si on est dernier à parler, il faut absolument quelqu'un pour éviter un redeal
    const last = allOthersPassed(state, seat);
    if (last && state.hand > 0) need -= BOT_TUNING.lastChanceRelief[level];
    const score = ev.value + jitter();
    if (score >= need) return { type: 'accept' };
    return { type: 'pass' };
  }

  // Deuxième tour : choisir une autre couleur (jamais celle déjà refusée)
  let bestSuit: Suit | null = null;
  let bestVal = -Infinity;
  let anySuit: Suit | null = null;
  let anyVal = -Infinity;
  for (const s of SUITS) {
    if (s === c.proposed) continue;
    const ev = evaluateTrump(hand, s);
    const v = ev.value + jitter();
    if (v > anyVal) { anyVal = v; anySuit = s; }
    if (ev.trumps < BOT_TUNING.secondMinTrumps[level]) continue;
    if (v > bestVal) { bestVal = v; bestSuit = s; }
  }
  const last = allSecondRoundBefore(state, seat);
  let need = BOT_TUNING.secondRoundMin[level];
  if (last) {
    // Dernier à pouvoir parler : plutôt que de forcer une redistribution, on prend
    // la meilleure couleur même avec peu d'atouts — sauf main vraiment misérable.
    need = Math.min(need - BOT_TUNING.lastChanceRelief[level], BOT_TUNING.lastChanceFloor[level]);
    if (anySuit && anyVal >= need) return { type: 'take', suit: anySuit };
  }
  if (bestSuit && bestVal >= need) return { type: 'take', suit: bestSuit };
  return { type: 'pass' };
}

function allOthersPassed(state: GameState, seat: Seat): boolean {
  const c = state.contract!;
  let count = 0;
  for (let i = 0; i < 4; i++) {
    if (i === seat) continue;
    if (c.passes[i]) count++;
  }
  return count === 3;
}

function allSecondRoundBefore(state: GameState, seat: Seat): boolean {
  // Vrai si ce joueur est le dernier à pouvoir parler au 2e tour
  const order: Seat[] = [];
  for (let i = 0; i < 4; i++) order.push(((state.dealer + 1 + i) % 4) as Seat);
  return order[3] === seat;
}

/* -------------------------------------------------------------------------- */
/* Jeu des cartes                                                             */
/* -------------------------------------------------------------------------- */

interface Ctx {
  state: GameState;
  seat: Seat;
  mem: Memory;
  legal: Card[];
  trick: { seat: Seat; card: Card }[];
  partner: Seat;
  last: boolean;
  /** bruit appliqué au coût des cartes (bots moins forts = plus de bruit) */
  noise?: number;
}

export function botPlay(state: GameState, seat: Seat, level: BotLevel): Card {
  const trump = state.trump!;
  const legal = legalCards(state.hands[seat], state.trick!.cards, trump, seat);
  if (legal.length === 1) return legal[0];
  const mem = buildMemory(state, seat);
  const base: Ctx = {
    state, seat, mem, legal, trick: state.trick!.cards, partner: partnerOf(seat),
    last: state.trick!.cards.length === 3,
  };

  // ---- FACILE : joueur débutant, ne compte pas les cartes, joue au plus bas
  if (level === 'facile') {
    const r = Math.random();
    if (r < 0.14) return legal[Math.floor(Math.random() * legal.length)];
    if (r < 0.86) return easyPick(legal, state.trick!.cards, trump, seat);
    return bestMove({ ...base, mem: blindMemory(mem), noise: 2.4 }, 'facile');
  }

  // ---- EXPERT : recherche en fin de main (2 derniers plis)
  if (state.tricks.length >= 6) {
    const found = endgameSearch(state, seat, mem, legal, level === 'expert' ? 34 : 12);
    if (found) return found;
  }

  if (level === 'normal') {
    // « Normal » : pas d'inférence de couleurs sèches, un peu de bruit
    return bestMove({ ...base, mem: blindMemory(mem), noise: 1.15 }, 'normal');
  }
  return bestMove(base, 'expert');
}

/** Mémoire amputée : le bot ne se souvient pas des couleurs sèches repérées. */
function blindMemory(mem: Memory): Memory {
  return { ...mem, voidIn: { H: new Set(), D: new Set(), C: new Set(), S: new Set() } };
}

/** Bot facile : prend quand c'est gratuit, sinon défausse la carte la moins chère. */
function easyPick(legal: Card[], trick: { seat: Seat; card: Card }[], trump: Suit, seat: Seat): Card {
  const isLast = trick.length === 3;
  const current = trick.length ? trickWinner(trick, trump) : null;
  const sorted = [...legal].sort((a, b) => cardPoints(a, trump) - cardPoints(b, trump));
  if (isLast && current !== null && TEAM_OF[current] !== TEAM_OF[seat]) {
    const winners = legal.filter((c) => beats(c, trickWinnerCard(trick, trump).card, trump));
    if (winners.length) return winners.sort((a, b) => cardPoints(a, trump) - cardPoints(b, trump))[0];
  }
  return sorted[0];
}

function trickWinnerCard(trick: { seat: Seat; card: Card }[], trump: Suit) {
  let best = trick[0];
  for (const tc of trick) if (beats(tc.card, best.card, trump)) best = tc;
  return best;
}

function bestMove(ctx: Ctx, level: BotLevel): Card {
  const { state, seat, mem, legal, trick, partner, last } = ctx;
  const noise = ctx.noise ?? 0;
  const trump = mem.trump;
  const isLead = trick.length === 0;

  if (isLead) return chooseLead(ctx, level);

  const winning = trickWinnerCard(trick, trump);
  const partnerWinning = TEAM_OF[winning.seat] === TEAM_OF[seat];
  const pot = trickPoints(trick, trump);

  // ---- Dernier à jouer : la situation est déterministe -------------------
  if (last) {
    const winners = legal.filter((c) => beats(c, winning.card, trump));
    if (partnerWinning) {
      // le partenaire ramasse : on lui « charge » des points, sinon on jette le plus petit
      const gifts = legal.filter((c) => !beats(c, winning.card, trump));
      if (gifts.length) {
        const best = gifts.sort(
          (a, b) => cardPoints(b, trump) - cardPoints(a, trump) + noise * (Math.random() - 0.5),
        )[0];
        // ne jamais mettre un atout maître sous le partenaire gagnant
        if (best.suit === trump && isMaster(best, mem) && cardPoints(best, trump) >= 14) {
          const low = gifts[gifts.length - 1];
          return low;
        }
        return best;
      }
      return winners[0] ?? legal[0];
    }
    if (winners.length) {
      // gagner en dépensant le moins possible
      const sorted = [...winners].sort(
        (a, b) => cost(a, mem, level, noise) - cost(b, mem, level, noise),
      );
      const w = sorted[0];
      // dernière levée : toujours prendre (bonus de 10)
      if (mem.trickIndex === 7) return w;
      // ne pas gaspiller une maîtresse d'atout pour un pli vide
      if (pot <= 4 && level !== 'facile' && w.suit === trump && isMaster(w, mem) && cardPoints(w, mem.trump) >= 10) {
        const cheap = legal.filter((c) => c.suit !== trump && cardPoints(c, trump) === 0);
        if (cheap.length) return cheap[0];
      }
      if (pot === 0 && level === 'expert' && w.suit === trump && isMaster(w, mem) && cardPoints(w, trump) === 0 && legal.some((c) => c.suit !== trump && cardPoints(c, trump) === 0)) {
        return legal.filter((c) => c.suit !== trump && cardPoints(c, trump) === 0)[0];
      }
      return w;
    }
    // ne peut pas gagner : défausser le moins de points possible
    return cheapestDiscard(legal, mem, level, noise);
  }

  // ---- Il reste des joueurs après moi -----------------------------------
  if (partnerWinning) {
    // Partenaire maître : ne pas monter dessus, éviter de gaspiller
    const safe = legal.filter((c) => !beats(c, winning.card, trump));
    if (safe.length) {
      // jouer un atout maître pour « dégager » est parfois utile en cours de main
      const nonTrumpLow = safe.filter((c) => c.suit !== trump && !isMaster(c, mem));
      const pool = nonTrumpLow.length ? nonTrumpLow : safe;
      return pool.sort((a, b) => cardPoints(a, trump) - cardPoints(b, trump) + cost(a, mem, level, noise) - cost(b, mem, level, noise))[0];
    }
    return legal[0];
  }

  // Adversaire maître : peut-on (ou faut-il) prendre ?
  const winners = legal.filter((c) => beats(c, winning.card, trump));
  if (winners.length) {
    const sorted = [...winners].sort((a, b) => cost(a, mem, level, noise) - cost(b, mem, level, noise));
    const w = sorted[0];
    const isCheapWin = isMaster(w, mem) || cost(w, mem, level) < 1.2;
    const inSecond = trick.length === 1;
    const shouldWin =
      mem.trickIndex === 7 ||
      pot >= 10 ||
      (pot >= 5 && level !== 'facile') ||
      trick.length === 2 ||
      (w.suit === trump && cardPoints(w, trump) >= 10 && pot >= 7) ||
      (isCheapWin && pot >= 2);
    // deuxième main : jouer petit plutôt que de se faire dépasser
    if (level === 'expert' && inSecond && pot <= 4 && !isCheapWin) {
      return cheapestDiscard(legal, mem, level, noise);
    }
    if (shouldWin) {
      // ne pas couper un pli sans valeur avec un atout maître si on peut pisser
      if (level === 'expert' && w.suit === trump && isMaster(w, mem) && pot <= 4 && mem.trickIndex < 6) {
        const passable = legal.filter((c) => c.suit !== trump);
        if (passable.length && trick.some((tc) => tc.card.suit === trump) === false) {
          const cheap = cheapestDiscard(passable, mem, level, noise);
          // si l'adversaire a déjà coupé, il faut monter : on ne peut rien y faire
          if (cardPoints(cheap, trump) === 0) return cheap;
        }
      }
      return w;
    }
  }
  return cheapestDiscard(legal, mem, level, noise);
}

/** Coût d'utilisation d'une carte : plus c'est élevé, plus c'est « cher ». */
function cost(card: Card, mem: Memory, level: BotLevel, noise = 0): number {
  if (level === 'facile') return cardPoints(card, mem.trump) + noise * Math.random();
  const base = cardPoints(card, mem.trump) + pointStrengthTrump(card.rank) * 0.6;
  const master = isMaster(card, mem) ? 1.6 : 0;
  const trumpMaster = card.suit === mem.trump && isMaster(card, mem) ? 3 : 0;
  return base + master + trumpMaster + noise * (Math.random() - 0.35);
}

/** Défausse : se débarrasser des cartes sans valeur, garder les maîtresses. */
function cheapestDiscard(legal: Card[], mem: Memory, level: BotLevel, noise = 0): Card {
  if (level === 'facile') {
    const best = [...legal].sort((a, b) => cardPoints(a, mem.trump) - cardPoints(b, mem.trump));
    return noise > 0 && Math.random() < 0.25 ? best[Math.min(1, best.length - 1)] : best[0];
  }
  const scored = legal.map((c) => {
    let s = cardPoints(c, mem.trump) + pointStrengthTrump(c.rank) * 0.35;
    if (c.suit === mem.trump) s += 2.4; // ne pas se séparer d'un atout sans raison
    if (isMaster(c, mem)) s += 3.0; // garder une maîtresse
    if (c.suit !== mem.trump && isMaster(c, mem) && mem.trickIndex >= 5) s += 1.0;
    // « décharger » une couleur sèche est bon : on peut couper ensuite
    return { c, s: s + noise * (Math.random() - 0.35) };
  });
  scored.sort((a, b) => a.s - b.s);
  return scored[0].c;
}

/* -------------------------------------------------------------------------- */
/* Recherche en fin de main (bots experts)                                    */
/* -------------------------------------------------------------------------- */

interface Sim {
  hands: Card[][];
  trick: { seat: Seat; card: Card }[];
  leader: Seat;
  trump: Suit;
  me: Seat;
}

/** Politique rapide et déterministe utilisée dans les simulations. */
function fastPolicy(hand: Card[], trick: { seat: Seat; card: Card }[], trump: Suit, seat: Seat, lastTrick: boolean): Card {
  const legal = legalCards(hand, trick, trump, seat);
  if (legal.length === 1) return legal[0];
  const byValue = [...legal].sort((a, b) => cardPoints(a, trump) - cardPoints(b, trump));

  if (!trick.length) {
    const nonTrump = byValue.filter((c) => c.suit !== trump);
    const pool = nonTrump.length ? nonTrump : byValue;
    // encaisse un As ou un 10 s'il est sec, sinon ouvre petit
    const ace = pool.find((c) => c.rank === 'A');
    if (ace && Math.random() < 0.6) return ace;
    return pool[0];
  }
  const winningCard = trickWinnerCard(trick, trump);
  const partnerWinning = TEAM_OF[winningCard.seat] === TEAM_OF[seat];
  const pot = trickPoints(trick, trump);
  const winners = legal.filter((c) => beats(c, winningCard.card, trump));
  const isLast = trick.length === 3;

  if (partnerWinning) {
    const gifts = legal.filter((c) => !beats(c, winningCard.card, trump));
    if (gifts.length) return gifts.sort((a, b) => cardPoints(b, trump) - cardPoints(a, trump))[0];
    return byValue[0];
  }
  if (winners.length && (isLast ? pot >= 0 || lastTrick : pot >= 6 || lastTrick)) {
    const cheap = [...winners].sort(
      (a, b) => cardPoints(a, trump) + pointStrengthTrump(a.rank) * 0.4 - (cardPoints(b, trump) + pointStrengthTrump(b.rank) * 0.4),
    )[0];
    if (lastTrick || isLast || pot >= 6 || cheap.suit === trump || cardPoints(cheap, trump) <= 4) return cheap;
  }
  return byValue[0];
}

/** Distribution aléatoire des cartes inconnues, compatible avec les couleurs sèches repérées. */
function sampleUnknowns(mem: Memory, hands: Card[][], me: Seat, voidIn: Record<Suit, Set<Seat>>): Card[][] | null {
  const unknown = [...mem.unseen];
  const need: number[] = [0, 0, 0, 0];
  for (const s of SEATS) if (s !== me) need[s] = hands[s].length;
  for (let attempt = 0; attempt < 40; attempt++) {
    // tirage
    for (let i = unknown.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unknown[i], unknown[j]] = [unknown[j], unknown[i]];
    }
    const out: Card[][] = hands.map((h, i) => (i === me ? [...h] : []));
    let idx = 0;
    let ok = true;
    for (const s of SEATS) {
      if (s === me) continue;
      for (let k = 0; k < need[s]; k++) {
        const c = unknown[idx++];
        if (!c) { ok = false; break; }
        if (voidIn[c.suit].has(s)) { ok = false; break; }
        out[s].push(c);
      }
      if (!ok) break;
    }
    if (ok && idx === unknown.length) return out;
  }
  return null;
}

/** Joue une donne aléatoire jusqu'au bout et renvoie les points gagnés par mon équipe. */
function playout(sim: Sim, firstCard: Card | null, lastTrickBonus: number): number {
  const { trump, me } = sim;
  const hands = sim.hands.map((h) => [...h]);
  let trick = sim.trick.map((t) => ({ ...t }));
  let gained: [number, number] = [0, 0];
  let totalTricks = 0;
  let simLeader = simLeaderOf(trick, sim.leader);

  const playOne = (seat: Seat, card: Card) => {
    const i = hands[seat].findIndex((c) => c.id === card.id);
    if (i >= 0) hands[seat].splice(i, 1);
    trick.push({ seat, card });
  };

  if (firstCard) {
    playOne(me, firstCard);
    if (trick.length === 4) {
      const w = trickWinner(trick, trump);
      gained[TEAM_OF[w]] += trickPoints(trick, trump);
      totalTricks++;
      const finished = !hands.some((h) => h.length > 0);
      if (finished) gained[TEAM_OF[w]] += lastTrickBonus;
      trick = [];
      simLeader = w;
    }
  }
  const remainingTricks = () => {
    let n = totalTricks;
    for (const s of SEATS) n += hands[s].length / 4;
    return n;
  };
  let guard = 0;
  while (hands.some((h) => h.length > 0) && guard++ < 40) {
    const seat = trick.length ? (((trick[trick.length - 1].seat + 1) % 4) as Seat) : simLeader;
    if (hands[seat].length === 0) break;
    const card = fastPolicy(hands[seat], trick, trump, seat, remainingTricks() >= 8);
    playOne(seat, card);
    if (trick.length === 4) {
      const w = trickWinner(trick, trump);
      gained[TEAM_OF[w]] += trickPoints(trick, trump);
      totalTricks++;
      const finished = !hands.some((h) => h.length > 0);
      if (finished) gained[TEAM_OF[w]] += lastTrickBonus;
      simLeader = w;
      trick = [];
    }
  }
  return gained[TEAM_OF[me]];
}

function simLeaderOf(trick: { seat: Seat; card: Card }[], fallback: Seat): Seat {
  return trick.length ? trick[0].seat : fallback;
}

/**
 * Recherche Monte-Carlo sur les deux derniers plis : chaque coup légal est
 * évalué sur un grand nombre de distributions plausibles des cartes inconnues.
 * Les bots experts planifient ainsi la fin de la manche sans jamais tricher.
 */
export function endgameSearch(
  state: GameState, seat: Seat, mem: Memory, legal: Card[], samples: number,
): Card | null {
  const trump = mem.trump;
  const unknown = mem.unseen.length;
  if (unknown === 0) return null;
  if (unknown > 12) return null;
  const lastTrickBonus = LAST_TRICK_BONUS;
  const baseHands = state.hands.map((h) => [...h]);
  let best: Card = legal[0];
  let bestScore = -Infinity;
  const perCard = Math.max(6, Math.floor(samples / Math.max(1, legal.length)));

  for (const card of legal) {
    let total = 0;
    let count = 0;
    for (let i = 0; i < perCard; i++) {
      const hands = sampleUnknowns(mem, baseHands, seat, mem.voidIn);
      if (!hands) return null;
      const sim: Sim = { hands, trick: state.trick!.cards.map((t) => ({ ...t })), leader: state.trick!.leader, trump, me: seat };
      total += playout(sim, card, lastTrickBonus);
      count++;
    }
    // léger biais vers les cartes bon marché en cas d'égalité
    const score = (count ? total / count : 0) - cardPoints(card, trump) * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Conduite du jeu (lead)                                                     */
/* -------------------------------------------------------------------------- */

function chooseLead(ctx: Ctx, level: BotLevel): Card {
  const { state, seat, mem, legal } = ctx;
  const trump = mem.trump;
  const myTrumps = state.hands[seat].filter((c) => c.suit === trump);
  const declaring = state.contract?.taker !== undefined && TEAM_OF[state.contract.taker] === TEAM_OF[seat];

  // Bot facile : ouvre une petite carte dans une couleur libre.
  if (level === 'facile') {
    const easyPool = legal.filter((c) => c.suit !== trump);
    const pool = easyPool.length ? easyPool : legal;
    return [...pool].sort((a, b) => cardPoints(a, trump) - cardPoints(b, trump))[0];
  }

  // 1) Tirer les atouts quand on est maître du contrat et qu'on en a beaucoup
  if (myTrumps.length >= 3 && mem.trumpsUnseen > 0) {
    const pull = declaring || myTrumps.length >= 4;
    const strongTrumps = myTrumps.filter((c) => pointStrengthTrump(c.rank) >= 2.4 || isMaster(c, mem));
    if (pull && strongTrumps.length) {
      const high = [...strongTrumps].sort(
        (a, b) => strength(b.rank, b.suit, trump) - strength(a.rank, a.suit, trump),
      )[0];
      const careful = level === 'expert' && mem.trumpsUnseen >= 5 && myTrumps.length === 3;
      if (mem.trickIndex <= 4 && !careful) return high;
    }
  }

  // 2) Encaisser une maîtresse (idéalement en y glissant des points)
  const masters = legal.filter((c) => c.suit !== trump && isMaster(c, mem));
  if (masters.length) {
    const paid = masters.filter((c) => cardPoints(c, trump) >= 10);
    const pool = paid.length ? paid : masters;
    return [...pool].sort((a, b) => cardPoints(b, trump) - cardPoints(a, trump))[0];
  }

  // 3) Fin de main : ouvrir une couleur sèche pour se préparer à couper
  if (mem.trickIndex >= 5) {
    const shortSuits = SUITS.filter(
      (s) => s !== trump && state.hands[seat].filter((c) => c.suit === s).length === 1,
    );
    if (shortSuits.length && myTrumps.length >= 2) {
      const cs = legal.filter((c) => c.suit === shortSuits[0]);
      if (cs.length) return cs[0];
    }
  }

  // 4) Sinon : une petite carte, en évitant d'ouvrir une couleur où un adversaire est sec
  const nonTrump = legal.filter((c) => c.suit !== trump);
  const pool = nonTrump.length ? nonTrump : legal;
  const scored = pool.map((c) => {
    let s = -cardPoints(c, trump) - pointStrengthTrump(c.rank) * 0.3;
    if (c.suit === trump) s -= 3;
    const oppVoid = SEATS.filter((x) => TEAM_OF[x] !== TEAM_OF[seat]).some((x) =>
      mem.voidIn[c.suit].has(x),
    );
    if (oppVoid && c.rank !== 'A' && c.rank !== '10') s -= 1.5;
    if (isMaster(c, mem)) s += 0.5;
    // en fin de main, ne pas offrir la dernière levée
    if (mem.trickIndex === 7 && c.suit !== trump && !isMaster(c, mem)) s -= 2;
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0].c;
}

/* -------------------------------------------------------------------------- */
/* Petites aides                                                              */
/* -------------------------------------------------------------------------- */

/** Le bot possède-t-il la belote (R+D d'atout) ? */
export function botHasBelote(state: GameState, seat: Seat): boolean {
  return state.trump ? hasBelote(state.hands[seat], state.trump) : false;
}

/** Points estimés de la main (pour l'affichage des bots / stats). */
export function estimateHandPoints(state: GameState, seat: Seat): number {
  if (!state.trump) return 0;
  return countPoints(state.hands[seat], state.trump);
}

export function trumpsOf(hand: Card[], trump: Suit): number {
  return countTrumps(hand, trump);
}

export { SUIT_FR, TRUMP_ORDER };
