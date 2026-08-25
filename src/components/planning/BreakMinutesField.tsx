'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BREAK_MINUTE_OPTIONS,
  formatBreakMinutes,
  legalBreakMinutes,
} from '@/lib/swissBreaks';

interface BreakMinutesFieldProps {
  /** Pause enregistrée, en minutes. */
  value: number;
  onChange: (minutes: number) => void;
  /** Durée travaillée de la journée, pour rappeler le minimum légal. */
  workedHours: number;
  label?: string;
}

/**
 * Choix de la durée de pause, avec rappel du minimum imposé par la loi
 * suisse pour la durée de la journée (art. 15 LTr).
 */
export function BreakMinutesField({
  value,
  onChange,
  workedHours,
  label = 'Pause',
}: BreakMinutesFieldProps) {
  const legal = legalBreakMinutes(workedHours);
  const tooShort = workedHours > 0 && value < legal;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        {workedHours > 0 && (
          <span className="text-[11px] text-slate-400">
            {legal > 0 ? `minimum légal : ${legal} min` : 'aucune pause imposée'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {BREAK_MINUTE_OPTIONS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => onChange(minutes)}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
              value === minutes
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            )}
          >
            {minutes === 0 ? 'Aucune' : formatBreakMinutes(minutes)}
          </button>
        ))}
      </div>

      {tooShort && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-700">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          En dessous du minimum légal pour cette durée de travail. La journée
          sera signalée dans les alertes.
        </p>
      )}
    </div>
  );
}
