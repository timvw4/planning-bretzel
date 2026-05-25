'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Coffee, Loader2, UtensilsCrossed } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import type { Employee } from '@/lib/types';
import { getPositionLabel } from '@/lib/employeePosition';
import { aggregateDeclarationStats, type DeclarationStats } from '@/lib/timePunches';
import { getInitials } from '@/lib/utils';

interface EmployeeDeclarationStatsDialogProps {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rangeStart: string;
  rangeEnd: string;
  periodLabel: string;
  view: 'week' | 'month';
}

/** Badges repas / pause (même style que l’onglet Pointages). */
function DeclarationBadges({
  pause15min,
  hadSnack,
  ateWorkFood,
}: {
  pause15min: boolean;
  hadSnack: boolean;
  ateWorkFood: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {pause15min ? (
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
          Pause 15 min
        </span>
      ) : (
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
          Pas de pause 15 min
        </span>
      )}
      {hadSnack && (
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200">
          Collation
        </span>
      )}
      {ateWorkFood && (
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200">
          Repas travail
        </span>
      )}
    </div>
  );
}

/** Fiche employé : compteurs repas, collation et pauses sur la période du planning réel. */
export function EmployeeDeclarationStatsDialog({
  employee,
  open,
  onOpenChange,
  rangeStart,
  rangeEnd,
  periodLabel,
  view,
}: EmployeeDeclarationStatsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DeclarationStats | null>(null);

  useEffect(() => {
    if (!open || !employee) {
      setStats(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('time_declarations')
        .select('date, pause_15min, had_snack, ate_work_food, clock_out_at')
        .eq('employee_id', employee!.id)
        .gte('date', rangeStart)
        .lte('date', rangeEnd)
        .not('clock_out_at', 'is', null)
        .order('date', { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error(error);
        setStats(null);
      } else {
        setStats(aggregateDeclarationStats(data ?? []));
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, employee, rangeStart, rangeEnd]);

  if (!employee) return null;

  const periodWord = view === 'week' ? 'cette semaine' : 'ce mois';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader className="text-left space-y-3">
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm"
              style={{ backgroundColor: employee.color }}
            >
              {getInitials(employee.firstName, employee.lastName)}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg leading-tight">
                {employee.firstName} {employee.lastName}
              </DialogTitle>
              <DialogDescription className="mt-1 space-y-0.5">
                <span className="block">{getPositionLabel(employee.position)}</span>
                <span className="block text-indigo-600 font-medium capitalize">{periodLabel}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Chargement…
          </div>
        ) : !stats || stats.totalDays === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-600">Aucune fin de service enregistrée</p>
            <p className="text-xs text-slate-400 mt-1">
              Les options repas et pause apparaissent quand l&apos;employé coche ses choix au départ ({periodWord}).
            </p>
          </div>
        ) : (
          <div className="space-y-5 py-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Synthèse {periodWord} · {stats.totalDays} jour{stats.totalDays > 1 ? 's' : ''} pointé{stats.totalDays > 1 ? 's' : ''}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase">
                  <UtensilsCrossed className="h-3 w-3" />
                  Repas au travail
                </div>
                <p className="text-2xl font-bold text-slate-800 mt-1">{stats.ateWorkFoodCount}</p>
                <p className="text-[10px] text-slate-400">fois coché « nourriture du travail »</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase">
                  <Coffee className="h-3 w-3" />
                  Collation
                </div>
                <p className="text-2xl font-bold text-slate-800 mt-1">{stats.hadSnackCount}</p>
                <p className="text-[10px] text-slate-400">fois coché « collation »</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-emerald-700 uppercase">Pause 15 min</p>
                <p className="text-2xl font-bold text-emerald-800 mt-1">{stats.pause15minCount}</p>
                <p className="text-[10px] text-emerald-600/80">jours avec pause confirmée</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-amber-700 uppercase">Sans pause 15 min</p>
                <p className="text-2xl font-bold text-amber-800 mt-1">{stats.noPause15minCount}</p>
                <p className="text-[10px] text-amber-600/80">jours sans pause déclarée</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Détail jour par jour
              </p>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {stats.days.map((day) => (
                  <div
                    key={day.date}
                    className="rounded-xl border border-slate-100 bg-white px-3 py-2.5"
                  >
                    <p className="text-xs font-semibold text-slate-700 mb-1.5 capitalize">
                      {format(parseISO(day.date), 'EEEE d MMMM', { locale: fr })}
                    </p>
                    <DeclarationBadges
                      pause15min={day.pause_15min}
                      hadSnack={day.had_snack}
                      ateWorkFood={day.ate_work_food}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-slate-100 pt-4 mt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
