'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  isSameMonth,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { History, Clock, CalendarDays } from 'lucide-react';
import { calculateShiftDuration, formatHours } from '@/lib/utils';

const MONTHS_TO_SHOW = 12;

interface MonthRow {
  key: string;
  label: string;
  isCurrentMonth: boolean;
  hours: number;
  daysWorked: number;
}

function PageSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-24 rounded-2xl bg-slate-100" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

export default function EmployeeHistoriquePage() {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<
    { date: string; validated_start: string | null; validated_end: string | null }[]
  >([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('employee_id')
        .eq('id', data.user.id)
        .single();
      setEmployeeId(profile?.employee_id ?? null);
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const supabase = createClient();
    const now = new Date();
    const rangeStart = format(
      startOfMonth(subMonths(now, MONTHS_TO_SHOW - 1)),
      'yyyy-MM-dd'
    );
    const rangeEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('schedule_entries')
      .select('date, validated_start, validated_end')
      .eq('employee_id', employeeId)
      .gte('date', rangeStart)
      .lte('date', rangeEnd)
      .not('validated_start', 'is', null)
      .not('validated_end', 'is', null)
      .order('date', { ascending: false });

    if (error) console.error(error);
    setEntries(data ?? []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const months = useMemo((): MonthRow[] => {
    const now = new Date();
    return Array.from({ length: MONTHS_TO_SHOW }, (_, i) => {
      const date = subMonths(now, i);
      const key = format(date, 'yyyy-MM');
      const monthStart = format(startOfMonth(date), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(date), 'yyyy-MM-dd');

      const monthEntries = entries.filter(
        (e) => e.date >= monthStart && e.date <= monthEnd
      );

      const hours = monthEntries.reduce(
        (sum, e) =>
          sum +
          calculateShiftDuration(e.validated_start!, e.validated_end!),
        0
      );

      return {
        key,
        label: format(date, 'MMMM yyyy', { locale: fr }),
        isCurrentMonth: isSameMonth(date, now),
        hours,
        daysWorked: monthEntries.length,
      };
    });
  }, [entries]);

  const totalHours = useMemo(
    () => months.reduce((sum, m) => sum + m.hours, 0),
    [months]
  );

  if (loading) return <PageSkeleton />;

  if (!employeeId) {
    return (
      <div className="text-center py-16 text-slate-500 text-sm">
        Compte non lié à un employé.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-600" />
          Historique
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Heures validées par l&apos;administrateur — {MONTHS_TO_SHOW} derniers mois
        </p>
      </div>

      {/* Synthèse totale */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-5 text-white shadow-sm">
        <div className="flex items-center gap-2 text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-1">
          <Clock className="w-3.5 h-3.5" />
          Total sur la période
        </div>
        <p className="text-3xl font-bold">{formatHours(totalHours)}</p>
        <p className="text-sm text-indigo-100 mt-1">
          {months.filter((m) => m.hours > 0).length} mois avec des heures enregistrées
        </p>
      </div>

      {/* Liste mois par mois */}
      <div className="space-y-2">
        {months.map((month) => (
          <div
            key={month.key}
            className={`bg-white rounded-2xl border px-4 py-3.5 flex items-center justify-between gap-3 ${
              month.isCurrentMonth ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-100'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
                <p className="text-sm font-semibold text-slate-800 capitalize">
                  {month.label}
                </p>
                {month.isCurrentMonth && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    En cours
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 ml-6">
                {month.daysWorked > 0
                  ? `${month.daysWorked} jour${month.daysWorked > 1 ? 's' : ''} validé${month.daysWorked > 1 ? 's' : ''}`
                  : 'Aucun jour validé'}
              </p>
            </div>
            <p
              className={`text-lg font-bold shrink-0 ${
                month.hours > 0 ? 'text-indigo-600' : 'text-slate-300'
              }`}
            >
              {month.hours > 0 ? formatHours(month.hours) : '—'}
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center px-2">
        Seules les heures approuvées dans l&apos;onglet Pointages apparaissent ici.
      </p>
    </div>
  );
}
