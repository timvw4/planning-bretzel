'use client';

import { Coffee, PauseCircle, UtensilsCrossed } from 'lucide-react';
import type { CellDeclarationFlags } from '@/lib/usePeriodDeclarations';
import { formatBreakMinutes } from '@/lib/swissBreaks';

interface ValidatedShiftDeclarationIconsProps {
  flags?: CellDeclarationFlags | null;
  /** Couleur du texte du shift (lisibilité sur fond coloré). */
  textColor: string;
  /** sm = vue mensuelle compacte, md = vue hebdomadaire. */
  size?: 'sm' | 'md';
}

/** Petites icônes repas / collation / pause dans une case shift validée. */
export function ValidatedShiftDeclarationIcons({
  flags,
  textColor,
  size = 'sm',
}: ValidatedShiftDeclarationIconsProps) {
  if (!flags) return null;

  const showPause = flags.pause_minutes > 0;
  const showSnack = flags.had_snack;
  const showMeal = flags.ate_work_food;

  if (!showPause && !showSnack && !showMeal) return null;

  const iconClass = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <div
      className={`flex items-center justify-center gap-0.5 ${size === 'sm' ? 'mt-0.5' : 'mt-1'}`}
      aria-label="Options fin de service"
    >
      {showPause && (
        <span
          title={`Pause ${formatBreakMinutes(flags.pause_minutes)}`}
          style={{ color: textColor }}
        >
          <PauseCircle className={iconClass} strokeWidth={2.5} />
        </span>
      )}
      {showSnack && (
        <span title="Collation" style={{ color: textColor }}>
          <Coffee className={iconClass} strokeWidth={2.5} />
        </span>
      )}
      {showMeal && (
        <span title="Repas au travail" style={{ color: textColor }}>
          <UtensilsCrossed className={iconClass} strokeWidth={2.5} />
        </span>
      )}
    </div>
  );
}
