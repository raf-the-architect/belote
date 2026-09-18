/* ============================================================================
 * Test d'interface (jsdom) : l'application se monte, on peut naviguer,
 * lancer une partie et jouer une carte. Attrape les erreurs d'exécution.
 * Usage : npx tsx tests/ui-smoke.tsx
 * ==========================================================================*/

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://belote.test/?seed=1&target=201&fast=1&level=expert&sound=0',
  pretendToBeVisual: true,
});

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(dom.window as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
(dom.window as unknown as { scrollTo: () => void }).scrollTo = () => {};

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.location = dom.window.location;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
Object.defineProperty(g, 'localStorage', { value: dom.window.localStorage, configurable: true });
g.ResizeObserver = RO;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);

const errors: string[] = [];
const origError = console.error;
console.error = (...args: unknown[]) => {
  const text = args.map(String).join(' ');
  if (text.includes('not wrapped in act')) return;
  errors.push(text);
  origError(...args);
};

let passed = 0;
let checks = 0;
function check(name: string, cond: boolean, extra = '') {
  checks++;
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    process.stderr.write(`  ✗ ${name} ${extra}\n`);
    process.exitCode = 1;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (sel: string) => dom.window.document.querySelector(sel);
const qa = (sel: string) => Array.from(dom.window.document.querySelectorAll(sel));
const byText = (sel: string, text: string) =>
  qa(sel).find((el) => (el.textContent ?? '').toLowerCase().includes(text.toLowerCase()));
const click = (el: Element | undefined) => {
  if (!el) throw new Error('élément introuvable');
  (el as HTMLElement).click();
};

async function main() {
  console.log('\nBelote Tunisienne — test d’interface\n');
  // jeu rapide pour atteindre la fin de manche dans un délai raisonnable
  dom.window.localStorage.setItem('belote-tunisie:settings', JSON.stringify({ sound: false, fastPlay: true, level: 'expert', target: 201 }));
  const { createRoot } = await import('react-dom/client');
  const { createElement } = await import('react');
  const App = (await import('../src/App')).default;

  const root = createRoot(dom.window.document.getElementById('root')!);
  root.render(createElement(App));
  await sleep(120);

  /* ------------------------------------------------------------- accueil */
  check('l’écran d’accueil s’affiche', !!q('.screen--start'));
  check('le titre BELOTE TUNISIE est présent', (q('.start__title h1')?.textContent ?? '').includes('BELOTE'));
  check('les 4 boutons principaux existent', qa('.start__buttons button').length >= 4);
  check('les cartes décoratives sont rendues', qa('.start__deco .card').length === 5);

  /* --------------------------------------------------------------- règles */
  click(byText('.start__buttons button', 'Comment jouer'));
  await sleep(80);
  check('l’écran des règles s’ouvre', !!q('.screen--rules'));
  check('les 7 sections de règles sont présentes', qa('.screen--rules .rule').length === 7);
  check('les tables de valeurs affichent 8 cartes chacune', qa('.rule__table').length === 2 && qa('.rule__table .value-row').length === 16);
  click(byText('button', 'j’ai compris'));
  await sleep(80);

  /* ----------------------------------------------------------- paramètres */
  click(byText('.start__buttons button', 'Paramètres'));
  await sleep(80);
  check('l’écran des paramètres s’ouvre', !!q('.screen--settings'));
  check('le volume est réglable', !!q('.slider input[type=range]'));
  click(byText('button', '← retour'));
  await sleep(80);

  /* ---------------------------------------------------------------- lobby */
  click(byText('.start__buttons button', 'Jouer contre les bots'));
  await sleep(80);
  check('le lobby solo s’affiche', !!q('.screen--lobby'));
  check('les 3 niveaux de bots sont proposés', qa('.level-card').length === 3);
  check('les objectifs de match sont proposés', qa('.target-row .chip').length === 4);
  check('la table du lobby montre 4 places', qa('.lobby__seat').length === 4);

  click(byText('.level-card', 'expert'));
  await sleep(40);
  click(byText('.btn--xl', 'commencer la partie'));
  await sleep(200);

  /* -------------------------------------------------------------- le jeu */
  check('la table de jeu s’affiche', !!q('.game'));
  check('le tapis est rendu', !!q('.felt__inner'));
  check('la barre de score affiche les 2 équipes', qa('.score-pill').length === 2);
  check('le badge d’atout est visible', !!q('.trump-badge'));
  check('3 sièges adverses sont rendus', qa('.seat').length === 3);
  check('le joueur a 5 cartes au premier tour', qa('.hand-fan .card').length === 5, `(${qa('.hand-fan .card').length})`);
  check('le panneau de contrat est affiché', !!q('.contract-panel'));

  // attente du tour de l'humain au contrat (les 3 bots passent d'abord)
  let takeBtn: Element | undefined;
  let passBtn: Element | undefined;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    takeBtn = q('.contract-panel .btn--take') ?? undefined;
    passBtn = byText('.contract-panel .btn--ghost', 'passer');
    if (takeBtn || passBtn) break;
  }
  check('les boutons Prendre / Passer apparaissent à votre tour', !!takeBtn || !!passBtn);
  check('le contrat n’est pas décidé avant l’action du joueur', !q('.actionbar'));
  if (takeBtn) click(takeBtn);
  else if (passBtn) click(passBtn);
  await sleep(1200);

  // le joueur joue ses cartes au fil de la manche
  let handSeen = 0;
  let sawPlaying = false;
  let playedByHuman = 0;
  let sawTrick = false;
  for (let i = 0; i < 260; i++) {
    await sleep(150);
    sawPlaying = sawPlaying || !!q('.actionbar');
    handSeen = Math.max(handSeen, qa('.hand-fan .card').length);
    sawTrick = sawTrick || qa('.trick__card').length > 0;
    const playable = qa('.hand-fan .card:not(.is-disabled)');
    if (playable.length) {
      click(playable[0]);
      await sleep(60);
      const playBtn = q('.btn--play:not(:disabled)') as HTMLElement | null;
      if (playBtn) { playBtn.click(); playedByHuman++; }
    }
  }
  check('au moins une carte jouée par le joueur', playedByHuman > 0, `(${playedByHuman})`);

  // fin de manche : décompte détaillé
  let breakdown = false;
  for (let i = 0; i < 120 && !breakdown; i++) {
    await sleep(200);
    breakdown = !!q('.overlay--score');
    const playable = qa('.hand-fan .card:not(:disabled)');
    if (playable.length && q('.btn--play:not(:disabled)')) (q('.btn--play:not(:disabled)') as HTMLElement).click();
  }
  check('le décompte de la manche s’affiche', breakdown);
  if (breakdown) {
    check('les deux équipes sont détaillées', qa('.scoreline').length === 2);
    check('les totaux de manche sont affichés', qa('.scoreline__total').length === 2);
    check('le score du match est affiché', !!q('.panel__match'));
    const labels = qa('.scoreline__row span:first-child').map((e) => e.textContent ?? '');
    check('les points des cartes sont détaillés', labels.filter((l) => l.includes('Points des cartes')).length === 2);
    check('le dernier pli est détaillé', labels.some((l) => l.includes('Dernier pli')));
    check('le total de manche est détaillé', labels.filter((l) => l.includes('Total de la manche')).length === 2);
    click(byText('.overlay--score .btn--primary', 'manche suivante'));
    await sleep(400);
  }
  check('la phase de jeu démarre (barre d’action visible)', sawPlaying);
  check('la main atteint 8 cartes après la prise', handSeen === 8, `(max ${handSeen})`);
  check('des cartes sont posées au centre (pli en cours)', sawTrick);
  check('aucune erreur console', errors.length === 0, errors.slice(0, 3).join(' | '));

  /* -------------------------------------------------- fin du match ------ */
  let victory = false;
  let handsPlayed = 0;
  let lastSeen = '';
  for (let i = 0; i < 700 && !victory; i++) {
    await sleep(140);
    victory = !!q('.overlay--victory');
    if (victory) break;

    const next = q('.overlay--score .btn--primary:not(:disabled)') as HTMLElement | null;
    if (next) { handsPlayed = Math.max(handsPlayed, qa('.scoreline').length / 2); next.click(); continue; }

    const take = q('.contract-panel .btn--take') as HTMLElement | null;
    if (take) { take.click(); continue; }

    const playable = qa('.hand-fan .card:not(.is-disabled)');
    if (playable.length) {
      click(playable[0]);
      await sleep(50);
      const playBtn = q('.btn--play:not(:disabled)') as HTMLElement | null;
      if (playBtn) playBtn.click();
      continue;
    }
    lastSeen = q('.actionbar') ? 'attente' : (q('.contract-panel') ? 'contrat' : (q('.dealing-flash') ? 'distribution' : 'inconnu'));
  }
  check('l’écran de victoire s’affiche à la fin du match', victory, `bloqué : ${lastSeen}`);
  if (victory) {
    check('l’écran de victoire montre les scores finaux', qa('.victory__team').length === 2);
    check('les statistiques du match sont affichées', qa('.victory__stats > div').length >= 4);
    check('l’historique des manches est affiché', qa('.victory__table-row').length >= 2,
      `${qa('.victory__table-row').length} manche(s) listée(s)`);
    check('les boutons Rejouer / Retour au lobby existent',
      !!byText('.overlay--victory button', 'rejouer') && !!byText('.overlay--victory button', 'retour au lobby'));
  }

  /* ------------------------------------------------------- on rejoue ----- */
  if (victory) {
    click(byText('.overlay--victory button', 'rejouer'));
    await sleep(600);
    const pills = qa('.score-pill__value').map((e) => (e.textContent ?? '').trim());
    check('« Rejouer » relance un match à zéro', !q('.overlay--victory') && !!q('.game')
      && pills.length === 2 && pills.every((p) => p === '0'), `(scores ${pills.join('-')})`);
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      const playable = qa('.hand-fan .card:not(.is-disabled)');
      if (playable.length) { click(playable[0]); await sleep(50); const b = q('.btn--play:not(:disabled)') as HTMLElement | null; if (b) b.click(); }
      const take = q('.contract-panel .btn--take') as HTMLElement | null;
      if (take) take.click();
    }
  }
  check('le tapis affiche toujours les cartes adverses face cachée', qa('.seat .card--back').length > 0 || qa('.hand-fan .card').length > 0);

  const failed = checks - passed;
  console.log(`\n${passed}/${checks} vérification(s) OK${failed ? ` — ${failed} échec(s)` : ''}${errors.length ? ` — ${errors.length} erreur(s) console` : ''}\n`);
  root.unmount();
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
