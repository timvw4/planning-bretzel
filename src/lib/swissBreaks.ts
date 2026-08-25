// ============================================================
// PAUSES — Barème légal suisse (art. 15 LTr)
// ============================================================
// La loi impose une pause minimale selon la durée du travail de la
// journée. Ces pauses ne comptent pas comme temps de travail, sauf si
// l'employé doit rester à son poste — d'où le réglage « déduire les
// pauses » qui laisse le choix à l'établissement.
//
//   plus de 5 h 30 de travail  ->  15 minutes
//   plus de 7 h de travail     ->  30 minutes
//   plus de 9 h de travail     ->  60 minutes

interface BreakRule {
  /** Durée de travail (en heures) au-delà de laquelle la règle s'applique. */
  aboveHours: number;
  minutes: number;
}

/** Du plus exigeant au moins exigeant, pour un premier match direct. */
const SWISS_BREAK_SCALE: BreakRule[] = [
  { aboveHours: 9, minutes: 60 },
  { aboveHours: 7, minutes: 30 },
  { aboveHours: 5.5, minutes: 15 },
];

/** Choix proposés dans les formulaires (en minutes). */
export const BREAK_MINUTE_OPTIONS = [0, 15, 30, 45, 60, 90] as const;

/** Pause minimale exigée par la loi pour une journée de `workedHours` heures. */
export function legalBreakMinutes(workedHours: number): number {
  if (!Number.isFinite(workedHours) || workedHours <= 0) return 0;
  const rule = SWISS_BREAK_SCALE.find((r) => workedHours > r.aboveHours);
  return rule ? rule.minutes : 0;
}

/** Vrai si la pause enregistrée est en dessous du minimum légal. */
export function isBreakBelowLegal(workedHours: number, breakMinutes: number): boolean {
  return breakMinutes < legalBreakMinutes(workedHours);
}

/** « 30 min », « 1 h », « 1 h 30 », « aucune ». */
export function formatBreakMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return 'aucune';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

/**
 * Pause à retenir par défaut sur une journée, à partir de ce qu'a déclaré
 * l'employé. Sert quand on reprend un ancien pointage qui n'avait que la
 * case « pause 15 min » : on ne suppose jamais plus que ce qui est prouvé.
 */
export function defaultBreakMinutes(
  pauseMinutes: number | null | undefined,
  legacyPauseFlag: boolean | null | undefined
): number {
  if (typeof pauseMinutes === 'number' && pauseMinutes >= 0) return pauseMinutes;
  return legacyPauseFlag ? 15 : 0;
}

/** Heures payées d'une journée : durée brute moins la pause si elle est déduite. */
export function netWorkedHours(
  grossHours: number,
  breakMinutes: number,
  deductBreaks: boolean
): number {
  if (!deductBreaks) return grossHours;
  const net = grossHours - (breakMinutes || 0) / 60;
  return net > 0 ? net : 0;
}
