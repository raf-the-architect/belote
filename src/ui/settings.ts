/* ============================================================================
 * Préférences du joueur (persistées dans localStorage).
 * ==========================================================================*/

import type { BotLevel } from '../game/types';

export interface Settings {
  sound: boolean;
  music: boolean;
  volume: number;
  vibrate: boolean;
  level: BotLevel;
  target: number;
  showHints: boolean;
  playerName: string;
  fastPlay: boolean;
  leftHanded: boolean;
}

const KEY = 'belote-tunisie:settings';

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: false,
  volume: 0.7,
  vibrate: true,
  level: 'normal',
  target: 1001,
  showHints: true,
  playerName: '',
  fastPlay: false,
  leftHanded: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const TARGET_OPTIONS = [501, 701, 1001, 1501];

export const LEVEL_LABEL: Record<BotLevel, string> = {
  facile: 'Facile',
  normal: 'Normal',
  expert: 'Expert',
};

export const LEVEL_DESC: Record<BotLevel, string> = {
  facile: 'Bots détendus : ils suivent les règles et prennent rarement.',
  normal: 'Bots solides : mémoire des plis, soutien du partenaire, atouts comptés.',
  expert: 'Bots expérimentés : comptage des atouts, couleurs sèches, fin de main calculée.',
};
