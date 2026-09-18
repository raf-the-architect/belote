/* ============================================================================
 * Vérifie le comportement de l'application quand elle est servie en statique
 * (GitHub Pages, Netlify, ouverture d'un fichier…) : le solo doit tourner
 * entièrement, et le mode en ligne doit guider vers un serveur de jeu au lieu
 * de rester bloqué sur « déconnecté ».
 *
 *   npx tsx tests/static-host.test.tsx
 * ==========================================================================*/
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://raf-the-architect.github.io/belote/',
  pretendToBeVisual: true,
});

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(dom.window as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

const g = globalThis as unknown as Record<string, unknown>;
g.ResizeObserver = RO;
Object.defineProperty(g, 'window', { value: dom.window, configurable: true });
Object.defineProperty(g, 'document', { value: dom.window.document, configurable: true });
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(g, 'location', { value: dom.window.location, configurable: true });
Object.defineProperty(g, 'HTMLElement', { value: dom.window.HTMLElement, configurable: true });
Object.defineProperty(g, 'Element', { value: dom.window.Element, configurable: true });
Object.defineProperty(g, 'Node', { value: dom.window.Node, configurable: true });
Object.defineProperty(g, 'localStorage', { value: dom.window.localStorage, configurable: true });
Object.defineProperty(g, 'requestAnimationFrame', { value: (cb: (t: number) => void) => setTimeout(() => cb(0), 16), configurable: true });
Object.defineProperty(g, 'cancelAnimationFrame', { value: (id: number) => clearTimeout(id), configurable: true });
// pas de serveur de jeu (comme sur un hébergement statique)
Object.defineProperty(g, 'WebSocket', {
  value: class {
    constructor() { throw new Error('no server'); }
  },
  configurable: true,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (sel: string) => dom.window.document.querySelector(sel);
const qa = (sel: string) => Array.from(dom.window.document.querySelectorAll(sel));
const byText = (sel: string, text: string) =>
  qa(sel).find((el) => (el.textContent ?? '').toLowerCase().includes(text.toLowerCase()));
const click = (el: Element | undefined) => { if (!el) throw new Error('élément introuvable'); (el as HTMLElement).click(); };

let passed = 0;
let checks = 0;
function check(name: string, cond: boolean, extra = '') {
  checks++;
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { process.stderr.write(`  ✗ ${name} ${extra}\n`); process.exitCode = 1; }
}

async function main() {
  console.log('\nBelote Tunisienne — hébergement statique (GitHub Pages)\n');
  dom.window.localStorage.setItem('belote-tunisie:settings', JSON.stringify({ sound: false, fastPlay: true, level: 'normal', target: 501 }));

  const { createRoot } = await import('react-dom/client');
  const { createElement } = await import('react');
  const App = (await import('../src/App')).default;
  const root = createRoot(dom.window.document.getElementById('root')!);
  root.render(createElement(App));
  await sleep(150);

  check('l’accueil s’affiche depuis un hébergement statique', !!q('.screen--start'));

  // en ligne : le bloc serveur doit être présent et expliquer la situation
  click(byText('.start__buttons button', 'Multijoueur'));
  await sleep(150);
  check('l’écran multijoueur s’ouvre', !!q('.screen--lobby'));
  check('le bloc « Serveur de jeu » est proposé', !!byText('.lobby__block h3', 'Serveur'));
  check('un champ permet de saisir l’adresse du serveur', !!q('.lobby__block--server .input'));
  check('l’état de connexion est affiché', !!q('.server-state'));

  click(byText('.lobby__block button', 'Créer la salle'));
  await sleep(400);
  const alert = q('.alert')?.textContent ?? '';
  check('un message clair remplace le silence quand aucun serveur ne répond',
    /solo|statique|serveur/i.test(alert), `(${alert.slice(0, 90)})`);

  click(byText('button', '← accueil'));
  await sleep(150);

  // le solo doit rester entièrement jouable
  click(byText('.start__buttons button', 'Jouer contre les bots'));
  await sleep(150);
  click(byText('.btn--xl', 'commencer la partie'));
  await sleep(2200);
  check('le solo démarre sans aucun serveur', !!q('.game') && !!q('.felt__inner'));
  check('les cartes des adversaires restent face cachée', qa('.seat .card--back').length > 0);

  const take = q('.contract-panel .btn--take') as HTMLElement | null;
  if (take) { take.click(); await sleep(1500); }
  check('une carte du joueur peut être jouée hors ligne', qa('.hand-fan .card').length > 0 && !!q('.btn--play'));

  console.log(`\n${passed}/${checks} vérification(s) OK\n`);
  root.unmount();
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
