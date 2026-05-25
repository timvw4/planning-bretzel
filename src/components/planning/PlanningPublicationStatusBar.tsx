'use client';

import { CheckCircle2, FilePenLine, LayoutGrid } from 'lucide-react';
import type { ScheduleEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

export type PlanningPublicationStatusBarProps = {
  /** Première date incluse de la période (yyyy-MM-dd) — mois calendaire ou semaine lundi–dim. */
  periodStart: string;
  periodEnd: string;
  scheduleEntries: ScheduleEntry[];
  /** Libellé lisible, ex. « avril 2026 » ou « semaine du 7 au 13 avril » */
  periodLabel: string;
};

/**
 * Indique clairement si le planning de la période est entièrement en brouillon,
 * partiellement communiqué ou entièrement visible côté employés.
 */
export function PlanningPublicationStatusBar({
  periodStart,
  periodEnd,
  scheduleEntries,
  periodLabel,
}: PlanningPublicationStatusBarProps) {
  const inRange = scheduleEntries.filter(
    (e) => e.date >= periodStart && e.date <= periodEnd
  );
  const draftCount = inRange.filter((e) => !e.visibleToEmployee).length;
  const publishedCount = inRange.filter((e) => e.visibleToEmployee).length;
  const total = inRange.length;

  if (total === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-2.5 mb-3 border-t border-slate-100 bg-slate-50/70">
        <div className="flex items-start gap-2.5 text-xs text-slate-600">
          <LayoutGrid className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold text-slate-800">Aucun shift sur cette période</span>
            <span className="text-slate-500"> - Planning non communiqué pour {periodLabel}.</span>
          </p>
        </div>
      </div>
    );
  }

  const allPublished = draftCount === 0;
  const allDraft = publishedCount === 0;

  const tone = allPublished ? 'success' : allDraft ? 'warning' : 'partial';

  const shell =
    tone === 'success'
      ? 'bg-emerald-50/95 border-emerald-100/80 text-emerald-950'
      : tone === 'warning'
        ? 'bg-amber-50/95 border-amber-100/80 text-amber-950'
        : 'bg-sky-50/95 border-sky-100/80 text-sky-950';

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-2.5 mb-3 border-t border-slate-100',
        shell
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {allPublished ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
        ) : (
          <FilePenLine className="h-4 w-4 shrink-0 mt-0.5 opacity-85 text-current" aria-hidden />
        )}
        <div className="min-w-0 text-xs leading-relaxed">
          {allPublished && (
            <p>
              <span className="font-semibold">Planning communiqué</span>
              {' — '}
              Les employés voient tous les créneaux de <span className="font-medium">{periodLabel}</span>.
            </p>
          )}
          {allDraft && (
            <p>
              <span className="font-semibold">Brouillon</span>
              {' — '}
              {total} créneau{total > 1 ? 'x' : ''} : rien n&apos;est encore visible côté employé pour{' '}
              <span className="font-medium">{periodLabel}</span>.
            </p>
          )}
          {!allPublished && !allDraft && (
            <p>
              <span className="font-semibold">Publication partielle</span>
              {' — '}
              <span className="font-medium">{draftCount}</span> créneau{draftCount > 1 ? 'x' : ''} encore brouillon (cadre
              grisé), <span className="font-medium">{publishedCount}</span> déjà communiqué
              {publishedCount > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      </div>

      {!allPublished && (
        <div className="flex items-center gap-2 shrink-0 text-[11px] font-semibold tracking-wide">
          <span className="inline-flex items-center rounded-lg bg-white/80 border border-black/[0.06] px-2.5 py-1 text-slate-700 shadow-sm">
            Brouillon&nbsp;: {draftCount}
          </span>
        </div>
      )}
    </div>
  );
}
