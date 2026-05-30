// ============================================================
// RÈGLES HORAIRES — Droit suisse du travail (LTr)
// Références : durée hebdomadaire max. (art. 9 LTr), repos (art. 15 LTr)
// ============================================================

import type { ContractType, EmployeePosition } from '@/lib/types';
import { POSITION_RULES } from '@/lib/employeePosition';

/** Temps plein courant en Suisse (boulangerie / commerce). */
export const SWISS_DEFAULT_FULL_TIME_HOURS = 42;

/** Plafond légal hebdomadaire — secteurs « autres » (commerce, hôtellerie, artisanat). */
export const SWISS_LEGAL_MAX_WEEKLY_HOURS = 50;

/** Plafond légal hebdomadaire — bureau, industrie, vente grande distribution. */
export const SWISS_LEGAL_MAX_WEEKLY_HOURS_STANDARD = 45;

/** Repos minimum consécutif entre deux journées (art. 15 LTr). */
export const SWISS_MIN_REST_HOURS = 11;

/** Heures / semaine proposées par défaut selon le type de contrat. */
export const SWISS_CONTRACT_DEFAULT_HOURS: Record<ContractType, number> = {
  fixed: SWISS_DEFAULT_FULL_TIME_HOURS,
  hourly: 20,
  intern: 40,
  apprentice: 38,
};

/** Plafond saisissable selon le type de contrat (prudence légale). */
export const SWISS_CONTRACT_MAX_HOURS: Record<ContractType, number> = {
  fixed: SWISS_LEGAL_MAX_WEEKLY_HOURS,
  hourly: SWISS_LEGAL_MAX_WEEKLY_HOURS,
  intern: SWISS_LEGAL_MAX_WEEKLY_HOURS_STANDARD,
  apprentice: 40,
};

/** Heures minimales selon le type de contrat. */
export const SWISS_CONTRACT_MIN_HOURS: Record<ContractType, number> = {
  fixed: 8,
  hourly: 1,
  intern: 8,
  apprentice: 16,
};

/** Valeur par défaut pour les paramètres globaux de l'application. */
export const SWISS_DEFAULT_MAX_WEEKLY_HOURS = SWISS_LEGAL_MAX_WEEKLY_HOURS;

export function getDefaultContractHours(
  contractType: ContractType,
  position?: EmployeePosition
): number {
  if (contractType === 'fixed' && position) {
    return POSITION_RULES[position].defaultContractHours;
  }
  return SWISS_CONTRACT_DEFAULT_HOURS[contractType];
}

export function getMaxContractHours(contractType: ContractType): number {
  return SWISS_CONTRACT_MAX_HOURS[contractType];
}

export function getMinContractHours(contractType: ContractType): number {
  return SWISS_CONTRACT_MIN_HOURS[contractType];
}

export function clampContractHours(hours: number, contractType: ContractType): number {
  const min = getMinContractHours(contractType);
  const max = getMaxContractHours(contractType);
  if (!Number.isFinite(hours) || hours < min) return min;
  if (hours > max) return max;
  return hours;
}
