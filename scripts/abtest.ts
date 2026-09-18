/* ============================================================================
 * A/B de la qualité de jeu : la même donne est jouée deux fois avec les
 * niveaux échangés entre les équipes. Les enchères sont identiques (niveau
 * « expert », sans bruit) : seule la qualité du jeu diffère.
 * Usage : npx tsx scripts/abtest.ts [donnes]
 * ==========================================================================*/

import {
  applyAction, awaitingCollect, collectTrick, createMatch, nextToPlay, playCard, redealHand, startHand,
} from '../src/game/engine';
import { botContractDecision, botPlay } from '../src/game/bots';
import type { BotLevel, GameState } from '../src/game/types';

const N = Number(process.argv[2] ?? 600);

interface Outcome { nous: number; eux: number; hands: number; redeals: number; decl: number; opp: number; success: number }

function play(cfg: { bid: BotLevel[]; play: BotLevel[] }, seed: number): Outcome {
  const out: Outcome = { nous: 0, eux: 0, hands: 0, redeals: 0, decl: 0, opp: 0, success: 0 };
  const st: GameState = createMatch({
    seed, target: 1e9, level: 'expert',
    levels: cfg.play as (BotLevel | null)[],
  });
  startHand(st);
  let guard = 0;
  while (st.phase !== 'handOver' && guard++ < 9000) {
    if (st.phase === 'contract') {
      const seat = st.contract!.turn;
      applyAction(st, seat, botContractDecision(st, seat, cfg.bid[seat]));
      if (st.pendingRedeal) { st.pendingRedeal = false; out.redeals++; redealHand(st); }
      continue;
    }
    if (awaitingCollect(st)) { collectTrick(st); continue; }
    const seat = nextToPlay(st)!;
    if (!playCard(st, seat, botPlay(st, seat, cfg.play[seat]))) throw new Error('coup refusé');
  }
  const r = st.history[0];
  out.hands = 1;
  out.nous = r.nous.total;
  out.eux = r.eux.total;
  out.decl = r.declaringTeam === 0 ? r.nous.total : r.eux.total;
  out.opp = r.declaringTeam === 0 ? r.eux.total : r.nous.total;
  out.success = r.contract === 'reussi' ? 1 : 0;
  return out;
}

function ab(a: BotLevel, b: BotLevel): void {
  const score = { a: 0, b: 0, hands: 0, redeals: 0, declA: 0, oppA: 0, declB: 0, oppB: 0, success: 0 };
  for (let i = 0; i < N; i++) {
    const seed = 70000 + i * 104729;
    // variante 1 : A en Nous (sièges 0,2), B en Eux (sièges 1,3)
    const o1 = play({ bid: ['expert', 'expert', 'expert', 'expert'], play: [a, b, a, b] }, seed);
    // variante 2 : les niveaux sont échangés
    const o2 = play({ bid: ['expert', 'expert', 'expert', 'expert'], play: [b, a, b, a] }, seed);
    // dans o1 « A » est l'équipe Nous, dans o2 « A » est l'équipe Eux
    score.a += o1.nous + o2.eux;
    score.b += o1.eux + o2.nous;
    score.hands += 2;
    score.redeals += o1.redeals + o2.redeals;
    score.declA += o1.decl + o2.opp;
    score.oppA += o1.opp + o2.decl;
    score.success += o1.success + o2.success;
  }
  const hands = score.hands;
  console.log(
    `${a.padEnd(6)} vs ${b.padEnd(6)} → ${a} : ${(score.a / hands).toFixed(1)} pts/manche` +
    ` | ${b} : ${(score.b / hands).toFixed(1)} pts/manche` +
    ` | écart ${((score.a - score.b) / hands).toFixed(1)}` +
    ` | déclarant ${(score.declA / hands).toFixed(0)} vs ${(score.oppA / hands).toFixed(0)}` +
    ` | réussite ${(100 * score.success / hands).toFixed(0)}%` +
    ` | redeal ${(100 * score.redeals / hands).toFixed(0)}%`,
  );
}

console.log(`\n=== A/B qualité de jeu (${N} donnes × 2, enchères identiques) ===\n`);
ab('expert', 'facile');
ab('expert', 'normal');
ab('normal', 'facile');
console.log('');
