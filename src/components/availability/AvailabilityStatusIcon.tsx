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
        className: 'text-sky-700',
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
