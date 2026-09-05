/**
 * FINOVA i18n core — dependency-free, NO React import.
 * Domain code (DateUtils, NotificationEngine) imports from here so localization never
 * drags React into the domain layer. The React provider lives in ./index.ts.
 */
import { en } from './locales/en';
import { fil } from './locales/fil';

export type Lang = 'en' | 'fil';

export const SUPPORTED_LANGS: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
];

type Dict = Record<string, unknown>;
type Flat = Record<string, string>;

function flatten(obj: Dict, prefix = ''): Flat {
  const out: Flat = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object') Object.assign(out, flatten(v as Dict, key));
  }
  return out;
}

const TABLES: Record<Lang, Flat> = {
  en: flatten(en as unknown as Dict),
  fil: flatten(fil as unknown as Dict),
};

let currentLang: Lang = 'en';

export function setLanguage(lang: Lang): void {
  currentLang = TABLES[lang] ? lang : 'en';
}

export function getLanguage(): Lang {
  return currentLang;
}

export type TVars = Record<string, string | number | undefined>;

function lookup(table: Flat, key: string, count?: number): string | undefined {
  if (typeof count === 'number') {
    const pluralKey = count === 1 ? `${key}_one` : `${key}_other`;
    if (table[pluralKey] !== undefined) return table[pluralKey];
  }
  return table[key];
}

/** Translate a key. Falls back to English, then to the raw key (never renders blank). */
export function t(key: string, vars?: TVars): string {
  const rawCount = vars?.count;
  const count = typeof rawCount === 'number' ? rawCount : undefined;
  const template = lookup(TABLES[currentLang], key, count) ?? lookup(TABLES.en, key, count);
  if (template === undefined) return key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? `{${name}}` : String(v);
  });
}

/** True only when `key` resolves to a real translation in the active language. */
function has(key: string): boolean {
  return TABLES[currentLang][key] !== undefined;
}

/**
 * Display name for a category: system categories localize by stable id (the stored
 * English name is a seed default, not user data); user-created names pass through.
 */
export function categoryName(cat: { id: string; name: string; isSystem?: boolean } | undefined): string {
  if (!cat) return '';
  if (!cat.isSystem) return cat.name;
  const key = `cat.${cat.id}`;
  return has(key) ? t(key) : cat.name;
}

// --- Localized calendar labels (Filipino uses its own short month/day forms) --------

const MONTHS_ABBR: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fil: ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'],
};

const MONTHS_FULL: Record<Lang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fil: ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre'],
};

const DAYS_ABBR: Record<Lang, string[]> = {
  en: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
  fil: ['LIN', 'LUN', 'MAR', 'MIY', 'HUW', 'BIY', 'SAB'],
};

/** monthAbbr(0-based index) */
export function monthAbbr(index0: number): string {
  return MONTHS_ABBR[currentLang][index0] ?? MONTHS_ABBR.en[index0] ?? '';
}

/** monthFull(1-based month number) */
export function monthFull(monthNumber: number): string {
  return MONTHS_FULL[currentLang][monthNumber - 1] ?? MONTHS_FULL.en[monthNumber - 1] ?? '';
}

/** dayAbbr(0=Sunday … 6=Saturday) */
export function dayAbbr(index0: number): string {
  return DAYS_ABBR[currentLang][index0] ?? DAYS_ABBR.en[index0] ?? '';
}

/** Exposed for the parity test: flattened key sets per language. */
export function localeKeys(lang: Lang): string[] {
  return Object.keys(TABLES[lang]).sort();
}
