/** Clé localStorage : l’employé a déjà vu la demande de localisation (une fois par compte / appareil). */
const STORAGE_PREFIX = 'bretzel_employee_geo_onboarding_v1';

function storageKey(employeeId: string): string {
  return `${STORAGE_PREFIX}_${employeeId}`;
}

/** True si la demande initiale a déjà été proposée pour cet employé sur cet appareil. */
export function hasCompletedGeoOnboarding(employeeId: string): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(storageKey(employeeId)) === '1';
}

/** Marque la demande comme faite (acceptée, refusée ou reportée). */
export function markGeoOnboardingComplete(employeeId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(employeeId), '1');
}
