'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isToday, getDay, addMonths,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, Sun, Info } from 'lucide-react';

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

export default function EmployeeSchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

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

  // Charger le planning du mois affiché
  useEffect(() => {
    if (!employeeId) return;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');

      const { data } = await supabase
        .from('schedule_entries')
        .select(`date, shifts (id, name, short_name, type, start_time, end_time, color, text_color, duration_hours)`)
        .eq('employee_id', employeeId)
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

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = (getDay(monthStart) + 6) % 7;

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
  const totalHours = entries.reduce((s, e) => s + (e.shift.durationHours ?? 0), 0);
  const workedDays = entries.filter((e) => e.shift.type === 'work').length;
  const offDays = entries.filter((e) => e.shift.type === 'off').length;

  // Prochain shift à venir
  const today = format(new Date(), 'yyyy-MM-dd');
  const nextEntry = entries.find((e) => e.date >= today && e.shift.type === 'work');

  return (
    <div className="space-y-5">

      {/* Prochain shift */}
      {nextEntry && (
        <div
          className="rounded-2xl p-4 border flex items-center gap-4"
          style={{ backgroundColor: nextEntry.shift.color, borderColor: nextEntry.shift.color }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
            style={{ backgroundColor: nextEntry.shift.textColor + '22', color: nextEntry.shift.textColor }}>
            {nextEntry.shift.shortName}
          </div>
          <div>
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

      {/* Stats du mois */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Heures</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{totalHours}h</p>
          <p className="text-xs text-slate-400 mt-0.5">ce mois</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Sun className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Travaillés</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{workedDays}</p>
          <p className="text-xs text-slate-400 mt-0.5">jours</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Info className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Repos</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{offDays}</p>
          <p className="text-xs text-slate-400 mt-0.5">jours</p>
        </div>
      </div>

      {/* Calendrier */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {/* Navigation mois */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <button
            onClick={() => setCurrentDate((d) => addMonths(d, -1))}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <h2 className="text-base font-bold text-slate-800 capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: fr })}
          </h2>
          <button
            onClick={() => setCurrentDate((d) => addMonths(d, 1))}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Jours de la semaine */}
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="py-2 text-center text-[11px] font-bold text-slate-400 tracking-wide">
              {day}
            </div>
          ))}
        </div>

        {/* Grille calendrier */}
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-sm text-slate-400">Chargement…</p>
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {/* Cellules vides pour aligner le 1er du mois */}
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="h-20 border-b border-r border-slate-50/80" />
            ))}

            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const entry = entryMap.get(dateStr);
              const isCurrentDay = isToday(day);
              const isWeekend = getDay(day) === 0 || getDay(day) === 6;

              return (
                <div
                  key={dateStr}
                  className={`h-20 border-b border-r border-slate-100 p-1.5 flex flex-col ${
                    isWeekend ? 'bg-slate-50/50' : ''
                  }`}
                >
                  {/* Numéro du jour */}
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

                  {/* Badge du shift */}
                  {entry && (
                    <div
                      className="rounded-lg px-1.5 py-1 flex-1 flex flex-col justify-center min-h-0"
                      style={{ backgroundColor: entry.shift.color, color: entry.shift.textColor }}
                    >
                      <span className="text-[11px] font-bold leading-tight truncate">
                        {entry.shift.shortName}
                      </span>
                      {entry.shift.type === 'work' && entry.shift.startTime && (
                        <span className="text-[9px] opacity-75 leading-tight mt-0.5">
                          {entry.shift.startTime}–{entry.shift.endTime}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Légende */}
      {entries.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Légende</p>
          <div className="flex flex-wrap gap-2">
            {[...new Map(entries.map((e) => [e.shift.id, e.shift])).values()].map((shift) => (
              <div
                key={shift.id}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: shift.color, color: shift.textColor }}
              >
                <span>{shift.shortName}</span>
                {shift.type === 'work' && (
                  <span className="opacity-60">· {shift.durationHours}h</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
