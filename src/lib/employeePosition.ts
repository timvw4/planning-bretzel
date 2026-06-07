import type { AvailabilityDay, EmployeePosition } from '@/lib/types';
import { getDay, parseISO } from 'date-fns';
import { DAY_NAMES_FR } from '@/lib/utils';

/** Jour de la semaine (date) → clé availability de la fiche employé. */
export function dateToAvailabilityDay(date: Date): AvailabilityDay {
  const map: Record<number, AvailabilityDay> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
  };
  return map[getDay(date)];
}

/** True si ce jour calendaire fait partie des jours habituels (fiche admin). */
export function isEmployeeWorkDay(date: Date, workDays: AvailabilityDay[]): boolean {
  if (workDays.length === 0) return false;
  return workDays.includes(dateToAvailabilityDay(date));
}

/** Exceptions enregistrées en base — absence d’entrée = jour habituel normal. */
export type StoredAvailabilityStatus = 'vacation' | 'unavailable';

/** Alias utilisé par le planning : seules les exceptions sont affichées. */
export type AvailabilityStatus = StoredAvailabilityStatus;

/** Convertit un statut lu en base (y compris legacy) vers une exception, ou undefined si normal. */
export function normalizeStoredAvailabilityStatus(
  status: string | undefined | null
): StoredAvailabilityStatus | undefined {
  if (!status) return undefined;
  if (status === 'preferred') return 'vacation';
  if (status === 'available') return undefined;
  if (status === 'vacation' || status === 'unavailable') return status;
  return undefined;
}

/** Exception sur un jour habituel, ou null si jour normal / hors jours habituels. */
export function getStoredAvailabilityOnWorkDay(
  date: Date,
  workDays: AvailabilityDay[],
  storedStatus: StoredAvailabilityStatus | undefined
): StoredAvailabilityStatus | null {
  if (!isEmployeeWorkDay(date, workDays)) return null;
  return storedStatus ?? null;
}

/** Mode de marquage selon le type de contrat. */
export type AvailabilityExceptionMode = 'vacation_only' | 'unavailable_only';

/** Cycle employé selon le contrat : vacances seules (fixe) ou indispos seules (à l’heure, etc.). */
export function getNextStoredAvailabilityStatus(
  current: StoredAvailabilityStatus | null,
  options?: { mode?: AvailabilityExceptionMode; allowVacation?: boolean }
): StoredAvailabilityStatus | null {
  const mode: AvailabilityExceptionMode =
    options?.mode ??
    (options?.allowVacation === false ? 'unavailable_only' : 'vacation_only');

  if (mode === 'vacation_only') {
    if (current === null) return 'vacation';
    return null;
  }

  if (current === null) return 'unavailable';
  return null;
}

/** Compte les jours vacances posés sur l’année civile (jours habituels uniquement). */
export function countAnnualVacationDays(
  rows: { date: string; status: string }[],
  workDays: AvailabilityDay[],
  year: number
): number {
  return rows.filter((row) => {
    const status = normalizeStoredAvailabilityStatus(row.status);
    if (status !== 'vacation') return false;
    if (parseInt(row.date.slice(0, 4), 10) !== year) return false;
    return isEmployeeWorkDay(parseISO(row.date), workDays);
  }).length;
}

/** Libellé court des jours habituels pour l’employé (ex. « Lun, Mar, Mer »). */
export function formatWorkDaysSummary(workDays: AvailabilityDay[]): string {
  const order: AvailabilityDay[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  return order
    .filter((d) => workDays.includes(d))
    .map((d) => DAY_NAMES_FR[d].substring(0, 3))
    .join(', ');
}

export const POSITION_RULES: Record<
  EmployeePosition,
  {
    label: string;
    shortLabel: string;
    description: string;
    defaultAvailability: AvailabilityDay[];
    defaultContractHours: number;
    canWorkNight: boolean;
    canWorkSunday: boolean;
    typicalHours: string;
  }
> = {
  boulanger: {
    label: 'Boulanger',
    shortLabel: 'Boulangerie',
    description: 'Production — fournées de nuit et travail le dimanche possibles.',
    defaultAvailability: [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ],
    defaultContractHours: 42,
    canWorkNight: true,
    canWorkSunday: true,
    typicalHours: 'Variable (fournées)',
  },
  vente: {
    label: 'Vente',
    shortLabel: 'Vente',
    description: 'Magasin — horaire type 6h30–15h, du lundi au samedi.',
    defaultAvailability: [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ],
    defaultContractHours: 42,
    canWorkNight: false,
    canWorkSunday: false,
    typicalHours: '6h30 – 15h',
  },
  cuisine: {
    label: 'Cuisine',
    shortLabel: 'Cuisine',
    description: 'Cuisine — horaire type 6h30–15h, du lundi au samedi.',
    defaultAvailability: [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ],
    defaultContractHours: 42,
    canWorkNight: false,
    canWorkSunday: false,
    typicalHours: '6h30 – 15h',
  },
};

export const EMPLOYEE_POSITIONS: EmployeePosition[] = ['boulanger', 'vente', 'cuisine'];

export function getPositionLabel(position: EmployeePosition): string {
  return POSITION_RULES[position].label;
}

/** Déduit le poste depuis l’ancien champ texte « role » (migration données). */
export function inferPositionFromLegacyRole(role: string | null | undefined): EmployeePosition {
  const r = (role ?? '').toLowerCase();
  if (
    r.includes('boul') ||
    r.includes('pât') ||
    r.includes('patiss') ||
    r.includes('four') ||
    r.includes('pain')
  ) {
    return 'boulanger';
  }
  if (r.includes('cuis') || r.includes('cuisine') || r.includes('plong')) {
    return 'cuisine';
  }
  return 'vente';
}

export function parseEmployeePosition(value: unknown): EmployeePosition {
  if (value === 'boulanger' || value === 'vente' || value === 'cuisine') {
    return value;
  }
  return inferPositionFromLegacyRole(typeof value === 'string' ? value : '');
}
