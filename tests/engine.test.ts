/* ============================================================================
 * Tests du moteur — exécuter : npm test
 * ==========================================================================*/

import assert from 'node:assert';
import type { BotLevel, Card, GameState, Seat, Suit } from '../src/game/types';
import {
  BELOTE_BONUS, LAST_TRICK_BONUS, PLAIN_POINTS, TOTAL_CARD_POINTS, TRUMP_POINTS, beats, cardPoints,
  fullDeck, illegalReason, legalCards, strength, trickWinner,
} from '../src/game/rules';
import {
  CONTRACT_TARGET, DEDANS_TOTAL, applyAction, awaitingCollect, collectTrick, createMatch, legalFor,
  nextToPlay, playCard, redealHand, startHand,
} from '../src/game/engine';
import { botContractDecision, botPlay } from '../src/game/bots';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

const C = (s: Suit, r: string): Card => ({ suit: s, rank: r as Card['rank'], id: `${s}-${r}` });

console.log('\nBelote Tunisienne — tests du moteur\n');

/* ---------------------------------------------------------------- paquet -- */
test('le paquet contient 32 cartes uniques', () => {
  const d = fullDeck();
  assert.strictEqual(d.length, 32);
  assert.strictEqual(new Set(d.map((c) => c.id)).size, 32);
});

test('total des points = 152', () => {
  const total = fullDeck().reduce((s, c) => s + cardPoints(c, 'H'), 0);
  assert.strictEqual(total, TOTAL_CARD_POINTS);
});

test('valeurs à l’atout et hors atout conformes', () => {
  assert.strictEqual(TRUMP_POINTS['J'], 20);
  assert.strictEqual(TRUMP_POINTS['9'], 14);
  assert.strictEqual(TRUMP_POINTS['A'], 11);
  assert.strictEqual(TRUMP_POINTS['10'], 10);
  assert.strictEqual(PLAIN_POINTS['J'], 2);
  assert.strictEqual(PLAIN_POINTS['9'], 0);
});

/* --------------------------------------------------------------- ordre --- */
test('ordre à l’atout : V > 9 > As > 10 > R > D > 8 > 7', () => {
  const t: Suit = 'S';
  const order = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'] as const;
  for (let i = 0; i < order.length - 1; i++) {
    assert.ok(strength(order[i], t, t) > strength(order[i + 1], t, t), `${order[i]} > ${order[i + 1]}`);
  }
});

test('ordre hors atout : As > 10 > R > D > V > 9 > 8 > 7', () => {
  const t: Suit = 'S';
  const order = ['A', '10', 'K', 'Q', 'J', '9', '8', '7'] as const;
  for (let i = 0; i < order.length - 1; i++) {
    assert.ok(strength(order[i], 'H', t) > strength(order[i + 1], 'H', t), `${order[i]} > ${order[i + 1]}`);
  }
});

test('un atout bat une couleur, une couleur ne bat pas l’atout', () => {
  assert.ok(beats(C('S', '7'), C('H', 'A'), 'S'));
  assert.ok(!beats(C('H', 'A'), C('S', '7'), 'S'));
  assert.ok(!beats(C('H', 'A'), C('D', '7'), 'S'));
});

/* -------------------------------------------------------------- légalité -- */
test('fournir la couleur est obligatoire', () => {
  const hand = [C('H', '7'), C('H', 'A'), C('S', '7'), C('D', '10')];
  const trick = [{ seat: 0 as Seat, card: C('H', 'K') }];
  const lg = legalCards(hand, trick, 'S', 1);
  assert.deepStrictEqual(lg.map((c) => c.id).sort(), ['H-7', 'H-A']);
  assert.ok(illegalReason(hand, trick, 'S', 1, C('S', '7')));
});

test('le partenaire maître : on peut pisser', () => {
  const hand = [C('S', '7'), C('S', 'J'), C('D', '10')];
  const trick = [
    { seat: 0 as Seat, card: C('H', 'K') },
    { seat: 1 as Seat, card: C('H', '7') },
    { seat: 2 as Seat, card: C('H', 'A') },
  ];
  assert.strictEqual(legalCards(hand, trick, 'S', 3).length, 3);
});

test('obligation de monter sur un atout déjà posé', () => {
  const hand = [C('S', '7'), C('S', 'J'), C('S', '9'), C('D', '10')];
  const trick = [
    { seat: 0 as Seat, card: C('H', 'K') },
    { seat: 1 as Seat, card: C('S', 'A') },
  ];
  const lg = legalCards(hand, trick, 'S', 2);
  assert.deepStrictEqual(lg.map((c) => c.id).sort(), ['S-9', 'S-J']);
  assert.ok(illegalReason(hand, trick, 'S', 2, C('S', '7')));
});

test('sans atout supérieur, le joueur peut jouer plus bas', () => {
  const hand = [C('S', '7'), C('D', '10')];
  const trick = [
    { seat: 0 as Seat, card: C('H', 'K') },
    { seat: 1 as Seat, card: C('S', 'A') },
  ];
  assert.strictEqual(legalCards(hand, trick, 'S', 2).length, 2);
});

test('après une coupe, on peut monter pour gagner', () => {
  const hand = [C('S', 'J'), C('S', '7'), C('D', '10')];
  const trick = [
    { seat: 0 as Seat, card: C('H', 'K') },
    { seat: 1 as Seat, card: C('S', '9') },
  ];
  assert.deepStrictEqual(legalCards(hand, trick, 'S', 2).map((c) => c.id), ['S-J']);
});

test('gagnant du pli : plus haut atout sinon plus haute de la couleur', () => {
  const trick = [
    { seat: 0 as Seat, card: C('H', 'A') },
    { seat: 1 as Seat, card: C('D', '7') },
    { seat: 2 as Seat, card: C('H', '10') },
    { seat: 3 as Seat, card: C('C', 'A') },
  ];
  assert.strictEqual(trickWinner(trick, 'S'), 0);
  const trumped = [
    { seat: 0 as Seat, card: C('H', 'A') },
    { seat: 1 as Seat, card: C('S', '7') },
    { seat: 2 as Seat, card: C('H', '10') },
    { seat: 3 as Seat, card: C('C', 'A') },
  ];
  assert.strictEqual(trickWinner(trumped, 'S'), 1);
});

/* ------------------------------------------------------------ plein jeu --- */
function driveContract(st: GameState, level: BotLevel): boolean {
  if (st.phase !== 'contract') return false;
  const seat = st.contract!.turn;
  const a = botContractDecision(st, seat, level);
  const ok = applyAction(st, seat, a);
  assert.ok(ok, `action de contrat refusée pour le siège ${seat}`);
  if (st.pendingRedeal) {
    st.pendingRedeal = false;
    redealHand(st);
  }
  return true;
}

/** Joue une manche complète ; renvoie l'état */
function playHandFully(seed: number, level: BotLevel = 'expert'): GameState {
  const st = createMatch({ seed, target: 100000, level });
  startHand(st);
  let guard = 0;
  while (st.phase !== 'handOver' && st.phase !== 'matchOver') {
    if (++guard > 20000) throw new Error('boucle infinie');
    if (st.phase === 'contract') {
      driveContract(st, level);
      continue;
    }
    if (awaitingCollect(st)) {
      collectTrick(st);
      continue;
    }
    if (st.phase === 'playing') {
      const seat = nextToPlay(st)!;
      const legal = legalFor(st, seat);
      assert.ok(legal.length > 0, 'aucun coup légal disponible');
      const card = botPlay(st, seat, level);
      assert.ok(legal.some((c) => c.id === card.id), `coup illégal du bot ${card.id} (siège ${seat})`);
      assert.ok(playCard(st, seat, card), 'playCard refusé');
    }
  }
  return st;
}

test('40 manches complètes sans coup illégal, 8 plis à chaque fois', () => {
  for (let s = 1; s <= 40; s++) {
    const st = playHandFully(s * 7919);
    assert.strictEqual(st.tricks.length, 8, 'il faut 8 plis par manche');
    for (const h of st.hands) assert.strictEqual(h.length, 0);
    for (const t of st.tricks) assert.strictEqual(t.cards.length, 4);
  }
});

test('le total marqué respecte le décompte (162 + belotes, ou 162 + belote du gagnant en cas de dedans)', () => {
  for (let s = 1; s <= 40; s++) {
    const r = playHandFully(s * 104729).history[0];
    const sum = r.nous.total + r.eux.total;
    const expected =
      r.contract === 'reussi'
        ? TOTAL_CARD_POINTS + LAST_TRICK_BONUS + r.nous.belote + r.eux.belote
        : TOTAL_CARD_POINTS + LAST_TRICK_BONUS + (r.declaringTeam === 0 ? r.eux.belote : r.nous.belote);
    assert.strictEqual(sum, expected, `total incohérent : ${sum} au lieu de ${expected}`);
  }
});

test('contrat manqué → 162 + belote pour l’adversaire, 0 pour le déclarant', () => {
  let found = 0;
  for (let s = 1; s <= 60 && found < 3; s++) {
    const r = playHandFully(s * 31337).history[0];
    if (r.contract !== 'dedans') continue;
    found++;
    const winnerLine = r.declaringTeam === 0 ? r.eux : r.nous;
    const loserLine = r.declaringTeam === 0 ? r.nous : r.eux;
    assert.strictEqual(loserLine.total, 0);
    assert.strictEqual(winnerLine.dedans, DEDANS_TOTAL);
    assert.strictEqual(winnerLine.total, DEDANS_TOTAL + winnerLine.belote);
  }
  assert.ok(found > 0, 'aucun dedans rencontré (statistiquement impossible)');
});

test('contrat réussi → déclarant >= 82', () => {
  for (let s = 1; s <= 20; s++) {
    const r = playHandFully(s * 90210).history[0];
    if (r.contract === 'reussi') {
      const line = r.declaringTeam === 0 ? r.nous : r.eux;
      assert.ok(line.total >= CONTRACT_TARGET, `contrat déclaré réussi mais ${line.total} points`);
    }
  }
});

test('les bots faciles et normaux jouent aussi dans les règles', () => {
  for (const lvl of ['facile', 'normal'] as BotLevel[]) {
    for (let s = 1; s <= 12; s++) {
      const st = playHandFully(s * 5011, lvl);
      assert.strictEqual(st.tricks.length + (st.phase === 'matchOver' ? 0 : 0), 8);
    }
  }
});

test('aucun joueur ne joue hors tour', () => {
  const st = createMatch({ seed: 777, level: 'expert' });
  startHand(st);
  let guard = 0;
  while (st.phase === 'contract' && ++guard < 200) if (!driveContract(st, 'expert')) break;
  const wrongSeat = ((st.contract!.turn + 2) % 4) as Seat;
  const legalWrong = legalFor(st, wrongSeat);
  assert.strictEqual(legalWrong.length, 0, 'un joueur hors tour ne peut pas jouer');
});

test('la carte retournée revient au preneur au premier tour (8 cartes chacun)', () => {
  const st = createMatch({ seed: 2468, level: 'normal' });
  startHand(st);
  assert.ok(st.faceUpCard);
  const faceId = st.faceUpCard!.id;
  let guard = 0;
  while (st.phase === 'contract' && ++guard < 60) {
    driveContract(st, 'normal');
    if (st.playing) {
      const taker = st.contract!.taker!;
      assert.ok(st.hands[taker].some((c) => c.id === faceId), 'le preneur doit recevoir la carte retournée');
      break;
    }
  }
  for (let i = 0; i < 4; i++) assert.strictEqual(st.hands[i].length, 8, `siège ${i} doit avoir 8 cartes`);
});

test('la couleur proposée est interdite au second tour', () => {
  const st = createMatch({ seed: 99, level: 'expert' });
  startHand(st);
  const proposed = st.contract!.proposed;
  let guard = 0;
  while (st.phase === 'contract' && st.contract!.firstRound && ++guard < 20) driveContract(st, 'expert');
  if (st.phase === 'contract') {
    assert.strictEqual(st.contract!.firstRound, false);
    const ok = applyAction(st, st.contract!.turn, { type: 'take', suit: proposed });
    assert.strictEqual(ok, false, 'la couleur refusée au 1er tour est interdite au 2e');
  }
});

console.log(`\n${passed} test(s) OK\n`);
