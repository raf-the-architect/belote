/* ============================================================================
 * Règles Belote Classique — Règles Tunisiennes
 * 32 cartes, 8 par joueur, classement et valeurs selon l'atout.
 * ==========================================================================*/

import type { Card, Rank, Suit, Trick, TrickCard, Seat, TeamId } from './types';
import { RANKS, SUITS, TEAM_OF, cardId, partnerOf } from './types';

/** Ordre décroissant à l'atout : V > 9 > As > 10 > R > D > 8 > 7 */
export const TRUMP_ORDER: Rank[] = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];

/** Ordre décroissant hors atout : As > 10 > R > D > V > 9 > 8 > 7 */
export const PLAIN_ORDER: Rank[] = ['A', '10', 'K', 'Q', 'J', '9', '8', '7'];

export const TRUMP_POINTS: Record<Rank, number> = {
  J: 20, '9': 14, A: 11, '10': 10, K: 4, Q: 3, '8': 0, '7': 0,
};

export const PLAIN_POINTS: Record<Rank, number> = {
  A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0,
};

/** Force (index dans l'ordre) — plus grand = plus fort */
export function strength(rank: Rank, suit: Suit, trump: Suit): number {
  const order = suit === trump ? TRUMP_ORDER : PLAIN_ORDER;
  return order.length - order.indexOf(rank);
}

export function orderOf(rank: Rank, suit: Suit, trump: Suit): number {
  return (suit === trump ? TRUMP_ORDER : PLAIN_ORDER).indexOf(rank);
}

export function cardPoints(card: Card, trump: Suit): number {
  return card.suit === trump ? TRUMP_POINTS[card.rank] : PLAIN_POINTS[card.rank];
}

export const TOTAL_CARD_POINTS = 152;
export const LAST_TRICK_BONUS = 10;
export const BELOTE_BONUS = 20;

/** Jeu de 32 cartes */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank, id: cardId(suit, rank) });
  return deck;
}

export const SEATS: Seat[] = [0, 1, 2, 3];

export function sortHand(hand: Card[], trump: Suit | null): Card[] {
  return [...hand].sort((a, b) => {
    const at = trump ? (a.suit === trump ? 0 : 1) : 0;
    const bt = trump ? (b.suit === trump ? 0 : 1) : 0;
    if (at !== bt) return at - bt;
    if (a.suit !== b.suit) {
      const order: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
      return order[a.suit] - order[b.suit];
    }
    return strength(b.rank, b.suit, trump ?? 'S') - strength(a.rank, a.suit, trump ?? 'S');
  });
}

/** Force relative d'une carte dans son atout ou sa couleur */
export function isTrump(card: Card, trump: Suit): boolean {
  return card.suit === trump;
}

/** La carte `a` est-elle strictement plus forte que `b` dans le pli ? */
export function beats(a: Card, b: Card, trump: Suit): boolean {
  if (a.suit !== b.suit) return a.suit === trump;
  return strength(a.rank, a.suit, trump) > strength(b.rank, b.suit, trump);
}

export function cardsInSuit(hand: Card[], suit: Suit): Card[] {
  return hand.filter((c) => c.suit === suit);
}

export function isVoid(hand: Card[], suit: Suit): boolean {
  return !hand.some((c) => c.suit === suit);
}

/**
 * Cartes légalement jouables.
 * - Fournir la couleur demandée si possible.
 * - Sinon : liberté. À l'atout, l'obligation de monter ("fournir sur atout") ne
 *   s'applique qu'au joueur qui joue l'atout — même s'il peut couper.
 *   Le partenaire du maître du pli reste totalement libre ("pisser").
 */
export function legalCards(hand: Card[], trick: TrickCard[], trump: Suit, seat: Seat): Card[] {
  if (trick.length === 0) return [...hand];
  const led = trick[0].card.suit;
  const following = hand.filter((c) => c.suit === led);
  if (following.length > 0) return following;

  // maître actuel du pli
  let best = trick[0];
  for (const tc of trick) if (beats(tc.card, best.card, trump)) best = tc;

  const myTrumps = hand.filter((c) => c.suit === trump);

  // Le partenaire est maître : aucune obligation (on peut "pisser")
  if (TEAM_OF[best.seat] === TEAM_OF[seat]) return [...hand];

  // Pli déjà coupé : obligation de monter si possible
  if (best.card.suit === trump) {
    if (myTrumps.length === 0) return [...hand];
    const higher = myTrumps.filter(
      (c) => strength(c.rank, c.suit, trump) > strength(best.card.rank, best.card.suit, trump),
    );
    return higher.length > 0 ? higher : [...hand];
  }

  // Coupe possible : on peut couper ou se défausser librement.
  return [...hand];
}

export function isLegal(hand: Card[], trick: TrickCard[], trump: Suit, seat: Seat, card: Card): boolean {
  return legalCards(hand, trick, trump, seat).some((c) => c.suit === card.suit && c.rank === card.rank);
}

/** Pourquoi une carte est-elle interdite ? (message utilisateur) */
export function illegalReason(hand: Card[], trick: TrickCard[], trump: Suit, seat: Seat, card: Card): string | null {
  if (isLegal(hand, trick, trump, seat, card)) return null;
  if (trick.length === 0) return 'C’est à vous de commencer le pli.';
  const led = trick[0].card.suit;
  const following = hand.filter((c) => c.suit === led);
  if (following.length > 0) return 'Vous devez fournir la couleur demandée.';

  let best = trick[0];
  for (const tc of trick) if (beats(tc.card, best.card, trump)) best = tc;
  if (TEAM_OF[best.seat] === TEAM_OF[seat]) return null;
  if (best.card.suit === trump) return 'Vous devez monter sur l’atout déjà posé.';
  return 'Carte non autorisée.';
}

/** Évalue un pli (peut être partiel) et renvoie le siège maître */
export function trickWinner(trick: TrickCard[], trump: Suit): Seat {
  let best = trick[0];
  for (const tc of trick) if (beats(tc.card, best.card, trump)) best = tc;
  return best.seat;
}

/** Carte maîtresse actuelle du pli */
export function trickWinningCard(trick: TrickCard[], trump: Suit): TrickCard {
  let best = trick[0];
  for (const tc of trick) if (beats(tc.card, best.card, trump)) best = tc;
  return best;
}

export function trickPoints(trick: TrickCard[], trump: Suit): number {
  return trick.reduce((s, tc) => s + cardPoints(tc.card, trump), 0);
}

/** Belote : Roi + Dame d'atout en main */
export function hasBelote(hand: Card[], trump: Suit): boolean {
  return hand.some((c) => c.suit === trump && c.rank === 'K') && hand.some((c) => c.suit === trump && c.rank === 'Q');
}

/** Force totale d'une main vis-à-vis d'un atout donné (pour les bots / le contrat) */
export function handStrength(hand: Card[], trump: Suit): number {
  let s = 0;
  for (const c of hand) {
    if (c.suit === trump) s += pointStrengthTrump(c.rank);
    else if (c.rank === 'A') s += 3.2;
    else if (c.rank === '10') s += 2.0;
    else if (c.rank === 'K') s += 1.0;
    else if (c.rank === 'Q') s += 0.6;
    else if (c.rank === 'J') s += 0.9;
  }
  return s;
}

export function pointStrengthTrump(rank: Rank): number {
  switch (rank) {
    case 'J': return 6;
    case '9': return 4.6;
    case 'A': return 3.6;
    case '10': return 2.4;
    case 'K': return 1.2;
    case 'Q': return 0.8;
    default: return 0.3;
  }
}

export function countTrumps(hand: Card[], trump: Suit): number {
  return hand.filter((c) => c.suit === trump).length;
}

export function countPoints(hand: Card[], trump: Suit): number {
  return hand.reduce((s, c) => s + cardPoints(c, trump), 0);
}

/** Suit les cartes déjà tombées dans un pli pour un joueur donné */
export function suitLed(trick: TrickCard[]): Suit | null {
  return trick.length ? trick[0].card.suit : null;
}

export function isBeloteCard(card: Card, trump: Suit): boolean {
  return card.suit === trump && (card.rank === 'K' || card.rank === 'Q');
}

export function findBeloteHolders(hands: Card[][], trump: Suit): Seat[] {
  const out: Seat[] = [];
  hands.forEach((h, i) => {
    if (hasBelote(h, trump)) out.push(i as Seat);
  });
  return out;
}

export function teamName(t: TeamId): string {
  return t === 0 ? 'Nous' : 'Eux';
}

export function describeTrick(trick: Trick, trump: Suit): string {
  if (!trick.cards.length) return '';
  const w = trick.winner !== undefined ? trick.winner : trickWinner(trick.cards, trump);
  return `Pli remporté par le siège ${w}`;
}

export { TEAM_OF, partnerOf };
export { SUITS, RANKS } from './types';
