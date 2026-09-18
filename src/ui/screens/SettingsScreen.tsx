/* ============================================================================
 * Paramètres
 * ==========================================================================*/

import type { BotLevel } from '../../game/types';
import { LEVEL_DESC, LEVEL_LABEL, TARGET_OPTIONS, type Settings } from '../settings';

export function SettingsScreen({
  settings, onChange, onBack, onResetStats,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onResetStats: () => void;
}) {
  return (
    <div className="screen screen--settings">
      <header className="screen__head">
        <button type="button" className="btn btn--back" onClick={onBack}>← Retour</button>
        <h2>Paramètres</h2>
        <p>Le jeu reste entièrement jouable sans son.</p>
      </header>

      <section className="settings__block">
        <h3>Ambiance</h3>
        <label className="switch">
          <span>Effets sonores</span>
          <input type="checkbox" checked={settings.sound} onChange={(e) => onChange({ sound: e.target.checked })} />
          <i />
        </label>
        <label className="slider">
          <span>Volume</span>
          <input
            type="range" min={0} max={1} step={0.05} value={settings.volume}
            onChange={(e) => onChange({ volume: Number(e.target.value) })}
          />
          <b>{Math.round(settings.volume * 100)}%</b>
        </label>
        <label className="switch">
          <span>Vibrations (mobile)</span>
          <input type="checkbox" checked={settings.vibrate} onChange={(e) => onChange({ vibrate: e.target.checked })} />
          <i />
        </label>
        <label className="switch">
          <span>Jeu rapide (animations courtes)</span>
          <input type="checkbox" checked={settings.fastPlay} onChange={(e) => onChange({ fastPlay: e.target.checked })} />
          <i />
        </label>
      </section>

      <section className="settings__block">
        <h3>Aides de jeu</h3>
        <label className="switch">
          <span>Afficher les rappels (règles, belote, fin de main)</span>
          <input type="checkbox" checked={settings.showHints} onChange={(e) => onChange({ showHints: e.target.checked })} />
          <i />
        </label>
        <label className="switch">
          <span>Disposition pour gaucher</span>
          <input type="checkbox" checked={settings.leftHanded} onChange={(e) => onChange({ leftHanded: e.target.checked })} />
          <i />
        </label>
      </section>

      <section className="settings__block">
        <h3>Partie par défaut</h3>
        <div className="level-grid level-grid--compact">
          {(['facile', 'normal', 'expert'] as BotLevel[]).map((l) => (
            <button
              key={l}
              type="button"
              className={`level-card ${settings.level === l ? 'is-active' : ''}`}
              onClick={() => onChange({ level: l })}
            >
              <b>{LEVEL_LABEL[l]}</b>
              <span className="level-card__stars">{l === 'facile' ? '★' : l === 'normal' ? '★★' : '★★★'}</span>
              <small>{LEVEL_DESC[l]}</small>
            </button>
          ))}
        </div>
        <div className="target-row">
          {TARGET_OPTIONS.map((t) => (
            <button key={t} type="button" className={`chip ${settings.target === t ? 'is-active' : ''}`} onClick={() => onChange({ target: t })}>
              {t} pts
            </button>
          ))}
        </div>
        <label className="input-row">
          <span>Nom de joueur</span>
          <input
            className="input" value={settings.playerName} maxLength={16} placeholder="Votre prénom"
            onChange={(e) => onChange({ playerName: e.target.value })}
          />
        </label>
      </section>

      <section className="settings__block">
        <h3>Données locales</h3>
        <p className="lobby__note">Les statistiques et préférences sont stockées uniquement sur votre appareil.</p>
        <button type="button" className="btn btn--ghost" onClick={onResetStats}>Réinitialiser mes statistiques</button>
      </section>
    </div>
  );
}
