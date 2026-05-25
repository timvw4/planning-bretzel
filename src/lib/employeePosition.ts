import type { AvailabilityDay, EmployeePosition } from '@/lib/types';
import { getDay } from 'date-fns';
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

export type AvailabilityStatus = 'available' | 'preferred' | 'unavailable';

const WORK_DAY_STATUS_CYCLE: AvailabilityStatus[] = ['available', 'preferred', 'unavailable'];

/** Statut affiché : entrée en base, ou « disponible » par défaut sur un jour habituel. */
export function getEffectiveAvailabilityStatus(
  date: Date,
  workDays: AvailabilityDay[],
  storedStatus: AvailabilityStatus | undefined
): AvailabilityStatus | null {
  if (!isEmployeeWorkDay(date, workDays)) return null;
  return storedStatus ?? 'available';
}

export function getNextWorkDayAvailabilityStatus(
  current: AvailabilityStatus
): AvailabilityStatus {
  const idx = WORK_DAY_STATUS_CYCLE.indexOf(current);
  return WORK_DAY_STATUS_CYCLE[(idx + 1) % WORK_DAY_STATUS_CYCLE.length];
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
    defaultContractHours: 35,
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
    defaultContractHours: 35,
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
