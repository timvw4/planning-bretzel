'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  getDay,
  addMonths,
  addWeeks,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, Sun, Info } from 'lucide-react';
import { getNextUpcomingWorkEntry } from '@/lib/utils';

interface Shift {
  id: string;
  name: string;
  shortName: string;
  type: string;
  startTime: string;
  endTime: string;
  color: string;
  textColor: string;
  durationHours: number;
}

interface ScheduleEntry {
  date: string;
  shift: Shift;
}

const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type CalendarView = 'month' | 'week';

export default function EmployeeSchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarView>('month');
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  /** Horloge pour mettre à jour le bandeau « prochain shift » après la fin d’un créneau (sans recharger). */
  const [now, setNow] = useState(() => new Date());

  // Charger l'employeeId depuis le profil connecté
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

  // Charger les entrées : plage = union du mois de currentDate et de la semaine (pour la vue semaine sans trou)
  useEffect(() => {
    if (!employeeId) return;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      const fetchStart = monthStart < weekStart ? monthStart : weekStart;
      const fetchEnd = monthEnd > weekEnd ? monthEnd : weekEnd;
      const start = format(fetchStart, 'yyyy-MM-dd');
      const end = format(fetchEnd, 'yyyy-MM-dd');

      const { data } = await supabase
        .from('schedule_entries')
        .select(`date, shifts (id, name, short_name, type, start_time, end_time, color, text_color, duration_hours)`)
        .eq('employee_id', employeeId)
        .eq('visible_to_employee', true)
        .gte('date', start)
        .lte('date', end)
        .order('date');

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setEntries(data.map((row: any) => ({
          date: row.date,
          shift: {
            id: row.shifts.id,
            name: row.shifts.name,
            shortName: row.shifts.short_name,
            type: row.shifts.type,
            startTime: row.shifts.start_time ?? '',
            endTime: row.shifts.end_time ?? '',
            color: row.shifts.color,
            textColor: row.shifts.text_color,
            durationHours: row.shifts.duration_hours ?? 0,
          },
        })));
      }
      setLoading(false);
    };
    load();
  }, [employeeId, currentDate]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nextEntry = useMemo(
    () => getNextUpcomingWorkEntry(entries, now),
    [entries, now]
  );

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = (getDay(monthStart) + 6) % 7;
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Compte non lié à un employé
  if (!loading && employeeId === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <Info className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Compte non lié</h2>
        <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
          Votre compte n&apos;est pas encore associé à une fiche employé. Contactez votre responsable pour finaliser la configuration.
        </p>
      </div>
    );
  }

  const entryMap = new Map(entries.map((e) => [e.date, e]));
  // Stats : semaine affichée ou mois affiché (selon le toggle)
  const entriesForStats =
    viewMode === 'week'
      ? entries.filter((e) => e.date >= weekStartStr && e.date <= weekEndStr)
      : entries.filter((e) => e.date >= monthStartStr && e.date <= monthEndStr);
  const statsPeriodLabel = viewMode === 'week' ? 'cette semaine' : 'ce mois';
  const totalHours = entriesForStats.reduce((s, e) => s + (e.shift.durationHours ?? 0), 0);
  const workedDays = entriesForStats.filter((e) => e.shift.type === 'work').length;
  const offDays = entriesForStats.filter((e) => e.shift.type === 'off').length;

  return (
    <div className="space-y-5">
      {/* Aucun créneau publié sur la plage chargée : soit vide, soit encore en préparation côté équipe */}
      {!loading && entries.length === 0 && employeeId && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Aucun planning affiché pour cette période</p>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Soit vous n&apos;avez pas encore de créneaux prévus, soit votre responsable n&apos;a pas encore
            &quot;envoyé&quot; le planning (mois ou semaine) depuis l&apos;interface admin. Revenez plus tard ou
            contactez votre équipe si besoin.
          </p>
        </div>
      )}

      {/* Prochain shift */}
      {nextEntry && (
        <div
          className="rounded-2xl p-4 border flex items-start gap-3"
          style={{ backgroundColor: nextEntry.shift.color, borderColor: nextEntry.shift.color }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 opacity-90"
            style={{ backgroundColor: nextEntry.shift.textColor + '22', color: nextEntry.shift.textColor }}
            aria-hidden
          >
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold opacity-70" style={{ color: nextEntry.shift.textColor }}>
              Prochain shift
            </p>
            <p className="font-bold" style={{ color: nextEntry.shift.textColor }}>
              {format(new Date(nextEntry.date + 'T12:00:00'), 'EEEE d MMMM', { locale: fr })} — {nextEntry.shift.name}
            </p>
            {nextEntry.shift.startTime && (
              <p className="text-sm opacity-80" style={{ color: nextEntry.shift.textColor }}>
                {nextEntry.shift.startTime} → {nextEntry.shift.endTime}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Statistiques (période = semaine ou mois selon le toggle) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Heures</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{totalHours}h</p>
          <p className="text-xs text-slate-400 mt-0.5">{statsPeriodLabel}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Sun className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Travaillés</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{workedDays}</p>
          <p className="text-xs text-slate-400 mt-0.5">jours · {statsPeriodLabel}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Info className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Repos</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{offDays}</p>
          <p className="text-xs text-slate-400 mt-0.5">jours · {statsPeriodLabel}</p>
        </div>
      </div>

      {/* Calendrier */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setCurrentDate((d) => (viewMode === 'week' ? addWeeks(d, -1) : addMonths(d, -1)))
              }
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
              aria-label={viewMode === 'week' ? 'Semaine précédente' : 'Mois précédent'}
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 text-center capitalize leading-snug px-1">
              {viewMode === 'month' ? (
                format(currentDate, 'MMMM yyyy', { locale: fr })
              ) : weekStart.getMonth() === weekEnd.getMonth() &&
                weekStart.getFullYear() === weekEnd.getFullYear() ? (
                <>
                  Semaine du {format(weekStart, 'd', { locale: fr })} au{' '}
                  {format(weekEnd, 'd MMMM yyyy', { locale: fr })}
                </>
              ) : (
                <>
                  Semaine du {format(weekStart, 'd MMM', { locale: fr })} au{' '}
                  {format(weekEnd, 'd MMM yyyy', { locale: fr })}
                </>
              )}
            </h2>
            <button
              type="button"
              onClick={() =>
                setCurrentDate((d) => (viewMode === 'week' ? addWeeks(d, 1) : addMonths(d, 1)))
              }
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
              aria-label={viewMode === 'week' ? 'Semaine suivante' : 'Mois suivant'}
            >
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Toggle semaine / mois */}
          <div className="flex justify-center">
            <div
              className="inline-flex rounded-xl bg-slate-100 p-1 gap-0.5"
              role="group"
              aria-label="Affichage du planning"
            >
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'week'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Semaine
              </button>
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'month'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Mois
              </button>
            </div>
          </div>
        </div>

        {/* Jours de la semaine (en-têtes colonnes) */}
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="py-2 text-center text-[11px] font-bold text-slate-400 tracking-wide">
              {day}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-sm text-slate-400">Chargement…</p>
          </div>
        ) : viewMode === 'month' ? (
          <div className="grid grid-cols-7">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="h-20 border-b border-r border-slate-50/80" />
            ))}

            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const entry = entryMap.get(dateStr);
              const isCurrentDay = isToday(day);
              const isWeekend = getDay(day) === 0 || getDay(day) === 6;
              const shift = entry?.shift;
              const showWorkTimesOnly =
                shift &&
                shift.type === 'work' &&
                shift.startTime &&
                shift.endTime &&
                !(shift.startTime === '00:00' && shift.endTime === '00:00');

              return (
                <div
                  key={dateStr}
                  className={`h-20 border-b border-r border-slate-100 p-1.5 flex flex-col ${
                    isWeekend ? 'bg-slate-50/50' : ''
                  }`}
                >
                  <span
                    className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 shrink-0 ${
                      isCurrentDay
                        ? 'bg-indigo-600 text-white'
                        : isWeekend
                          ? 'text-slate-400'
                          : 'text-slate-600'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>

                  {entry && (
                    <div
                      className="rounded-lg px-1 py-1 flex-1 flex flex-col items-center justify-center min-h-0 text-center gap-0.5"
                      style={{ backgroundColor: entry.shift.color, color: entry.shift.textColor }}
                    >
                      {showWorkTimesOnly ? (
                        <span className="text-[10px] font-semibold leading-tight">
                          {entry.shift.startTime}–{entry.shift.endTime}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold leading-tight truncate max-w-full">
                          {entry.shift.shortName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {weekDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const entry = entryMap.get(dateStr);
              const isCurrentDay = isToday(day);
              const isWeekend = getDay(day) === 0 || getDay(day) === 6;
              const shift = entry?.shift;
              const showWorkTimesOnly =
                shift &&
                shift.type === 'work' &&
                shift.startTime &&
                shift.endTime &&
                !(shift.startTime === '00:00' && shift.endTime === '00:00');

              return (
                <div
                  key={dateStr}
                  className={`min-h-[120px] sm:min-h-[140px] border-b border-r border-slate-100 p-2 flex flex-col ${
                    isWeekend ? 'bg-slate-50/50' : ''
                  }`}
                >
                  <span
                    className={`text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full mb-2 shrink-0 ${
                      isCurrentDay
                        ? 'bg-indigo-600 text-white'
                        : isWeekend
                          ? 'text-slate-400'
                          : 'text-slate-600'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>

                  {entry && (
                    <div
                      className="rounded-xl px-2 py-2 flex-1 flex flex-col items-center justify-center min-h-0 text-center gap-1"
                      style={{ backgroundColor: entry.shift.color, color: entry.shift.textColor }}
                    >
                      {showWorkTimesOnly ? (
                        <span className="text-xs font-semibold leading-tight">
                          {entry.shift.startTime}–{entry.shift.endTime}
                        </span>
                      ) : (
                        <span className="text-sm font-bold leading-tight">{entry.shift.shortName}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
