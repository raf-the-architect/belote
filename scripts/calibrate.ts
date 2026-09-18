/* ============================================================================
 * Calibration : taux de prise, réussite du contrat, force relative des bots.
 * Usage : npx tsx scripts/calibrate.ts [manchesParConfig]
 * ==========================================================================*/

import {
  applyAction, awaitingCollect, collectTrick, createMatch, nextToPlay, playCard, redealHand, startHand,
} from '../src/game/engine';
import { BOT_TUNING, botContractDecision, botPlay } from '../src/game/bots';
import type { BotLevel, GameState } from '../src/game/types';

const N = Number(process.argv[2] ?? 300);

type Bid = BotLevel; type Play = BotLevel;
interface Cfg { bid: BotLevel | BotLevel[]; play: BotLevel | BotLevel[] }

interface Stats {
  deals: number; first: number; second: number; redeal: number;
  hands: number; success: number; dedans: number; belote: number;
  declPts: number; oppPts: number; nousTotal: number; euxTotal: number;
}

function level(arr: BotLevel | BotLevel[], seat: number): BotLevel {
  return Array.isArray(arr) ? arr[seat] : arr;
}

function runOne(cfg: Cfg, seed: number, acc: Stats): void {
  const st: GameState = createMatch({
    seed, target: 1e9, level: 'expert',
    levels: [0, 1, 2, 3].map((s) => level(cfg.play, s)) as (BotLevel | null)[],
  });
  startHand(st);
  acc.deals++;
  let guard = 0;
  while (st.phase !== 'handOver' && guard++ < 8000) {
    if (st.phase === 'contract') {
      const c = st.contract!;
      const seat = c.turn;
      const a = botContractDecision(st, seat, level(cfg.bid, seat));
      if (a.type !== 'pass') {
        if (c.firstRound) acc.first++;
        else acc.second++;
      }
      applyAction(st, seat, a);
      if (st.pendingRedeal) {
        st.pendingRedeal = false;
        acc.redeal++;
        acc.deals++;
        redealHand(st);
      }
      continue;
    }
    if (awaitingCollect(st)) { collectTrick(st); continue; }
    const seat = nextToPlay(st)!;
    const card = botPlay(st, seat, level(cfg.play, seat));
    if (!playCard(st, seat, card)) throw new Error(`coup refusé ${card.id} siège ${seat}`);
  }
  const r = st.history[0];
  acc.hands++;
  if (r.contract === 'reussi') acc.success++; else acc.dedans++;
  if (r.nous.belote + r.eux.belote > 0) acc.belote++;
  acc.declPts += r.declaringTeam === 0 ? r.nous.total : r.eux.total;
  acc.oppPts += r.declaringTeam === 0 ? r.eux.total : r.nous.total;
  acc.nousTotal += r.nous.total;
  acc.euxTotal += r.eux.total;
}

function empty(): Stats {
  return { deals: 0, first: 0, second: 0, redeal: 0, hands: 0, success: 0, dedans: 0, belote: 0, declPts: 0, oppPts: 0, nousTotal: 0, euxTotal: 0 };
}

function report(label: string, s: Stats): void {
  const deals = Math.max(s.deals, 1);
  const hands = Math.max(s.hands, 1);
  console.log(
    `${label.padEnd(22)} | 1er tour ${(100 * s.first / deals).toFixed(0).padStart(3)}%` +
    ` | 2e tour ${(100 * s.second / deals).toFixed(0).padStart(3)}%` +
    ` | redeal ${(100 * s.redeal / deals).toFixed(0).padStart(2)}%` +
    ` | réussite ${(100 * s.success / hands).toFixed(0)}%` +
    ` | dedans ${(100 * s.dedans / hands).toFixed(0)}%` +
    ` | déclarant ${(s.declPts / hands).toFixed(0)} vs ${(s.oppPts / hands).toFixed(0)}` +
    ` | belotes ${(100 * s.belote / hands).toFixed(0)}%`,
  );
}

function sweep(label: string, first: number, second: number, play: BotLevel): void {
  const keepF = BOT_TUNING.firstRoundMin.expert;
  const keepS = BOT_TUNING.secondRoundMin.expert;
  BOT_TUNING.firstRoundMin.expert = first;
  BOT_TUNING.secondRoundMin.expert = second;
  const s = empty();
  for (let i = 0; i < N; i++) runOne({ bid: 'expert', play }, 9000 + i * 7717, s);
  report(label, s);
  BOT_TUNING.firstRoundMin.expert = keepF;
  BOT_TUNING.secondRoundMin.expert = keepS;
}

const mode = process.argv[3] ?? 'full';

if (mode === 'sweep') {
  console.log(`\n=== Balayage du seuil de prise (${N} manches) ===\n`);
  for (const [f, s] of [[14.2, 11.5], [13.8, 11.0], [13.4, 10.5], [13.0, 10.0], [12.6, 9.5], [12.2, 9.0], [11.8, 8.5]] as [number, number][]) {
    sweep(`seuil 1er t=${f} 2e t=${s}`, f, s, 'expert');
  }
} else {
  console.log(`\n=== Bots (${N} manches / configuration) ===\n`);
  for (const lvl of ['facile', 'normal', 'expert'] as BotLevel[]) {
    const s = empty();
    for (let i = 0; i < N; i++) runOne({ bid: lvl, play: lvl }, 1000 + i * 7717, s);
    report(lvl, s);
  }
  console.log('\n=== Force relative (mêmes enchères « expert » des deux côtés) ===\n');
  for (const [a, b] of [['expert', 'normal'], ['expert', 'facile'], ['normal', 'facile']] as [BotLevel, BotLevel][]) {
    const s = empty();
    const seats = [a, b, a, b] as BotLevel[];
    for (let i = 0; i < N; i++) runOne({ bid: 'expert', play: seats }, 50000 + i * 3391, s);
    console.log(
      `${a} (Nous) vs ${b} (Eux) — ${N} manches : moyenne ${(s.nousTotal / N).toFixed(0)} vs ${(s.euxTotal / N).toFixed(0)} points par manche` +
      ` (réussite ${(100 * s.success / N).toFixed(0)}%)`,
    );
  }
}
console.log('');
