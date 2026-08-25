// ============================================================
// JOURS FÉRIÉS SUISSES
// ============================================================
// En Suisse, seul le 1er août est férié au niveau fédéral : tous les
// autres jours sont fixés par les cantons, et quelques-uns varient même
// d'une commune à l'autre (Valais, Fribourg notamment).
// Ce module propose donc une base commune à tous les cantons, plus les
// ajouts propres à chaque canton romand. La liste reste modifiable à la
// main dans les Paramètres.

import { addDays, format } from 'date-fns';
import type { PublicHoliday } from '@/lib/types';

export type SwissCantonCode = 'CH' | 'GE' | 'VD' | 'VS' | 'FR' | 'NE' | 'JU' | 'BE';

export const SWISS_CANTON_LABELS: Record<SwissCantonCode, string> = {
  CH: 'Base commune à tous les cantons',
  GE: 'Genève',
  VD: 'Vaud',
  VS: 'Valais',
  FR: 'Fribourg',
  NE: 'Neuchâtel',
  JU: 'Jura',
  BE: 'Berne',
};

export const SWISS_CANTON_CODES: SwissCantonCode[] = [
  'CH',
  'GE',
  'VD',
  'VS',
  'FR',
  'NE',
  'JU',
  'BE',
];

/** Dimanche de Pâques (algorithme de Meeus / Jones / Butcher, calendrier grégorien). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Nième dimanche de septembre (n = 1 pour le premier). */
function nthSundayOfSeptember(year: number, n: number): Date {
  const first = new Date(year, 8, 1);
  const daysUntilSunday = (7 - first.getDay()) % 7;
  return new Date(year, 8, 1 + daysUntilSunday + (n - 1) * 7);
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * Jours fériés d'une année pour un canton donné.
 * `CH` retourne uniquement les jours reconnus dans (pratiquement) tous les
 * cantons : c'est le choix prudent quand on n'est pas sûr.
 */
export function getSwissHolidays(
  year: number,
  canton: SwissCantonCode = 'CH'
): PublicHoliday[] {
  const easter = easterSunday(year);

  const goodFriday = { date: iso(addDays(easter, -2)), name: 'Vendredi Saint' };
  const easterMonday = { date: iso(addDays(easter, 1)), name: 'Lundi de Pâques' };
  const ascension = { date: iso(addDays(easter, 39)), name: 'Ascension' };
  const whitMonday = { date: iso(addDays(easter, 50)), name: 'Lundi de Pentecôte' };
  const corpusChristi = { date: iso(addDays(easter, 60)), name: 'Fête-Dieu' };

  // Lundi du Jeûne fédéral : lundi qui suit le 3e dimanche de septembre.
  const federalFast = {
    date: iso(addDays(nthSundayOfSeptember(year, 3), 1)),
    name: 'Lundi du Jeûne fédéral',
  };
  // Jeûne genevois : jeudi qui suit le 1er dimanche de septembre.
  const genevaFast = {
    date: iso(addDays(nthSundayOfSeptember(year, 1), 4)),
    name: 'Jeûne genevois',
  };

  const newYear = { date: `${year}-01-01`, name: 'Nouvel An' };
  const berchtold = { date: `${year}-01-02`, name: 'Saint-Berchtold' };
  const labourDay = { date: `${year}-05-01`, name: 'Fête du Travail' };
  const nationalDay = { date: `${year}-08-01`, name: 'Fête nationale' };
  const assumption = { date: `${year}-08-15`, name: 'Assomption' };
  const allSaints = { date: `${year}-11-01`, name: 'Toussaint' };
  const immaculate = { date: `${year}-12-08`, name: 'Immaculée Conception' };
  const christmas = { date: `${year}-12-25`, name: 'Noël' };
  const stStephen = { date: `${year}-12-26`, name: 'Saint-Étienne' };

  // Jours reconnus partout : socle de départ.
  const base: PublicHoliday[] = [newYear, ascension, nationalDay, christmas];

  const parCanton: Record<SwissCantonCode, PublicHoliday[]> = {
    CH: [],
    GE: [
      goodFriday,
      easterMonday,
      whitMonday,
      genevaFast,
      { date: `${year}-12-31`, name: 'Restauration de la République' },
    ],
    VD: [berchtold, goodFriday, easterMonday, whitMonday, federalFast],
    VS: [
      { date: `${year}-03-19`, name: 'Saint-Joseph' },
      corpusChristi,
      assumption,
      allSaints,
      immaculate,
    ],
    FR: [
      goodFriday,
      easterMonday,
      whitMonday,
      corpusChristi,
      assumption,
      allSaints,
      immaculate,
      stStephen,
    ],
    NE: [
      berchtold,
      { date: `${year}-03-01`, name: 'Instauration de la République' },
      goodFriday,
      easterMonday,
      labourDay,
      whitMonday,
      federalFast,
    ],
    JU: [
      berchtold,
      goodFriday,
      easterMonday,
      labourDay,
      whitMonday,
      corpusChristi,
      { date: `${year}-06-23`, name: 'Commémoration du plébiscite' },
      assumption,
      allSaints,
    ],
    BE: [berchtold, goodFriday, easterMonday, whitMonday, stStephen],
  };

  const parDate = new Map<string, PublicHoliday>();
  for (const jour of [...base, ...parCanton[canton]]) {
    parDate.set(jour.date, jour);
  }

  return [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
