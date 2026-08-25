'use client';

import { Sun, X } from 'lucide-react';
import {
  normalizeStoredAvailabilityStatus,
  type StoredAvailabilityStatus,
} from '@/lib/employeePosition';

export function resolveAvailabilityDisplayStatus(
  status: string | undefined | null
): StoredAvailabilityStatus | null {
  return normalizeStoredAvailabilityStatus(status) ?? null;
}

/**
 * Couleurs des exceptions de disponibilité, partagées par tous les écrans :
 * l'employé doit reconnaître au premier coup d'œil, dans son planning, la
 * même pastille que celle qu'il a posée dans ses disponibilités.
 */
export const AVAILABILITY_EXCEPTION_STYLE: Record<
  StoredAvailabilityStatus,
  { label: string; shortLabel: string; bg: string; text: string; border: string }
> = {
  vacation: {
    label: 'Vacances',
    shortLabel: 'Vac.',
    bg: '#FEF3C7',
    text: '#D97706',
    border: '#FCD34D',
  },
  unavailable: {
    label: 'Indisponible',
    shortLabel: 'Indispo',
    bg: '#FEE2E2',
    text: '#DC2626',
    border: '#FCA5A5',
  },
};

/** Infos d’affichage (titre, couleur) pour le planning admin — exceptions uniquement. */
export function availabilityStatusMeta(status: string | undefined | null): {
  title: string;
  className: string;
  displayStatus: StoredAvailabilityStatus;
} | null {
  const displayStatus = resolveAvailabilityDisplayStatus(status);
  if (!displayStatus) return null;

  switch (displayStatus) {
    case 'vacation':
      return {
        title: 'Disponibilité : Vacances',
        className: 'text-amber-600',
        displayStatus,
      };
    case 'unavailable':
      return {
        title: 'Disponibilité : Indisponible',
        className: 'text-red-600',
        displayStatus,
      };
  }
}

interface AvailabilityStatusIconProps {
  status: StoredAvailabilityStatus | string;
  className?: string;
  style?: React.CSSProperties;
  size?: number;
  strokeWidth?: number;
}

/** Icône SVG pour une exception de disponibilité (vacances ou indisponible). */
export function AvailabilityStatusIcon({
  status,
  className = '',
  style,
  size = 14,
  strokeWidth = 2.5,
}: AvailabilityStatusIconProps) {
  const resolved =
    status === 'vacation' || status === 'unavailable'
      ? status
      : resolveAvailabilityDisplayStatus(status);

  if (!resolved) return null;

  const iconProps = { className, style, size, strokeWidth, 'aria-hidden': true as const };

  switch (resolved) {
    case 'vacation':
      return <Sun {...iconProps} />;
    case 'unavailable':
      return <X {...iconProps} />;
  }
}
