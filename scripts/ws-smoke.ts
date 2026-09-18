/* Test de fumée du multijoueur : crée une salle, lance la partie, vérifie les vues. */
import WebSocket from 'ws';

const url = process.argv[2] ?? 'ws://localhost:3000/ws';
const ws = new WebSocket(url);
let you = '';
let views = 0;
let hands = 0;
let plays = 0;
let maxHand = 0;
let lastPhase = '';
let restarted = false;
let restartOk = false;
const seen = new Set<string>();

ws.on('open', () => ws.send(JSON.stringify({ t: 'create', name: 'Testeur', level: 'normal', target: 101 })));
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'welcome') {
    you = m.playerId;
    console.log('welcome', m.code, 'player', m.playerId);
    ws.send(JSON.stringify({ t: 'start' }));
  }
  if (m.t === 'room') {
    console.log('room', m.room.code, 'players:', m.room.players.filter((p: any) => !p.isBot).length, 'started', m.room.started);
  }
  if (m.t === 'view' && restarted && !restartOk) {
    const v = m.view;
    if (v.phase !== 'matchOver' && v.scores[0] === 0 && v.scores[1] === 0) {
      restartOk = true;
      console.log('  match relancé à zéro · phase', v.phase, '· cible', v.matchTarget);
    }
  }
  if (m.t === 'view') {
    views++;
    const v = m.view;
    maxHand = Math.max(maxHand, v.cards.length);
    if (v.phase !== lastPhase) {
      lastPhase = v.phase;
      console.log('phase →', v.phase, '| main', v.cards.length, '| cartes adverses masquées:', v.players.filter((p: any) => p.seat !== v.you).every((p: any) => typeof p.cards === 'number'));
      if (v.phase === 'playing') {
        console.log('  atout:', v.trump, '| preneur siège', v.contract.taker, '| légales:', v.legal.length);
      }
    }
    seen.add(v.phase);
    if (v.phase === 'playing' && v.legal.length) {
      const card = v.cards.find((c: any) => v.legal.includes(c.id));
      if (card) { plays++; ws.send(JSON.stringify({ t: 'action', action: { type: 'play', card } })); }
    }
    if (v.phase === 'handOver') {
      const r = v.history[v.history.length - 1];
      console.log(`  manche ${r.hand} terminée : Nous ${r.nous.total} — Eux ${r.eux.total} (${r.contract}) | match ${r.matchNous}-${r.matchEux}`);
      hands++;
      setTimeout(() => ws.send(JSON.stringify({ t: 'nextHand' })), 250);
    }
    if (v.phase === 'matchOver' && !restarted) {
      restarted = true;
      process.stdout.write('  match terminé · relance demandée par l’hôte\n');
      ws.send(JSON.stringify({ t: 'restart' }));
      setTimeout(finish, 4000);
    }
    if (v.phase === 'contract' && v.contract.turn === v.you) {
      ws.send(JSON.stringify({ t: 'action', action: v.contract.firstRound ? { type: 'accept' } : { type: 'pass' } }));
    }
  }
  if (m.t === 'error') console.log('ERROR', m.message);
});
let closed = false;
function finish() {
  if (closed) return;
  closed = true;
  console.log(`\n${views} vues reçues · main max ${maxHand} · phases ${[...seen].join(', ')}`);
  console.log('relance après match :', restartOk ? 'OK ✓' : 'non atteinte');
  console.log(views > 20 && maxHand === 8 ? 'OK ✓' : 'PROBLÈME ✗');
  ws.close();
  process.exit(0);
}
setTimeout(finish, 80000);
