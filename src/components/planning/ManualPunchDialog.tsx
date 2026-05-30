'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import { usePlanningStore } from '@/lib/store';
import {
  dateAndHHMMToISO,
  isDeclarableWorkShift,
  syncScheduleFromApproved,
} from '@/lib/timePunches';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ManualPunchDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
  /** Pré-remplit l’employé à l’ouverture (optionnel). */
  defaultEmployeeId?: string;
  /** Pré-remplit la date à l’ouverture (optionnel, format YYYY-MM-DD). */
  defaultDate?: string;
}

export function ManualPunchDialog({
  open,
  onOpenChange,
  onDone,
  defaultEmployeeId,
  defaultDate,
}: ManualPunchDialogProps) {
  const { employees, shifts, loadData } = usePlanningStore();
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [needsShiftPick, setNeedsShiftPick] = useState(false);
  const [existingPunch, setExistingPunch] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [pause15min, setPause15min] = useState(true);
  const [hadSnack, setHadSnack] = useState(false);
  const [ateWorkFood, setAteWorkFood] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const workShifts = useMemo(
    () =>
      shifts.filter(
        (s) =>
          s.isActive &&
          isDeclarableWorkShift({ type: s.type, short_name: s.shortName })
      ),
    [shifts]
  );

  const activeEmployees = useMemo(
    () =>
      [...employees]
        .filter((e) => e.isActive)
        .sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr')),
    [employees]
  );

  useEffect(() => {
    if (open) void loadData({ silent: true });
  }, [open, loadData]);

  useEffect(() => {
    if (!open) return;
    setEmployeeId(defaultEmployeeId ?? '');
    setDate(defaultDate ?? format(new Date(), 'yyyy-MM-dd'));
    setStartTime('');
    setEndTime('');
    setShiftId('');
    setNeedsShiftPick(false);
    setExistingPunch(false);
    setPause15min(true);
    setHadSnack(false);
    setAteWorkFood(false);
    setNote('');
  }, [open, defaultEmployeeId, defaultDate]);

  useEffect(() => {
    if (!open || !employeeId || !date) {
      setExistingPunch(false);
      setNeedsShiftPick(false);
      return;
    }

    let cancelled = false;
    setLoadingContext(true);

    void (async () => {
      const supabase = createClient();
      const [{ data: punchRow }, { data: entryRow }] = await Promise.all([
        supabase
          .from('time_declarations')
          .select('id')
          .eq('employee_id', employeeId)
          .eq('date', date)
          .maybeSingle(),
        supabase
          .from('schedule_entries')
          .select(
            'id, shift_id, shifts ( start_time, end_time, type, short_name )'
          )
          .eq('employee_id', employeeId)
          .eq('date', date)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setExistingPunch(Boolean(punchRow));

      const sh = entryRow?.shifts as
        | { start_time: string; end_time: string; type?: string; short_name?: string }
        | null
        | undefined;

      if (entryRow && sh && isDeclarableWorkShift(sh)) {
        setNeedsShiftPick(false);
        setShiftId(entryRow.shift_id);
        setStartTime(sh.start_time ?? '');
        setEndTime(sh.end_time ?? '');
      } else {
        setNeedsShiftPick(true);
        setShiftId('');
        setStartTime('');
        setEndTime('');
      }

      setLoadingContext(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, employeeId, date]);

  useEffect(() => {
    if (!needsShiftPick || !shiftId) return;
    const shift = workShifts.find((s) => s.id === shiftId);
    if (shift) {
      setStartTime(shift.startTime);
      setEndTime(shift.endTime);
    }
  }, [shiftId, needsShiftPick, workShifts]);

  const handleSave = async () => {
    if (!employeeId) {
      toast.error('Sélectionnez un employé.');
      return;
    }
    if (existingPunch) {
      toast.error('Un pointage existe déjà pour cet employé à cette date.');
      return;
    }
    if (!startTime || !endTime) {
      toast.error('Heures de début et de fin requises.');
      return;
    }
    if (needsShiftPick && !shiftId) {
      toast.error('Sélectionnez un shift travail pour ce jour.');
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const resolvedShiftId =
      shiftId ||
      workShifts.find((s) => s.startTime === startTime && s.endTime === endTime)?.id;

    if (needsShiftPick && !resolvedShiftId) {
      toast.error('Sélectionnez un shift travail pour ce jour.');
      setSubmitting(false);
      return;
    }

    const finalShiftId = shiftId || resolvedShiftId!;

    if (needsShiftPick) {
      const { error: entryError } = await supabase.from('schedule_entries').upsert(
        {
          id: crypto.randomUUID(),
          employee_id: employeeId,
          shift_id: finalShiftId,
          date,
          note: '',
          is_modified: false,
          visible_to_employee: true,
          validated_start: null,
          validated_end: null,
        },
        { onConflict: 'employee_id,date' }
      );
      if (entryError) {
        toast.error('Impossible de créer l’entrée planning.');
        setSubmitting(false);
        return;
      }
    }

    const shift = workShifts.find((s) => s.id === finalShiftId);
    const plannedStart = shift?.startTime ?? startTime;
    const plannedEnd = shift?.endTime ?? endTime;

    const { error } = await supabase.from('time_declarations').insert({
      employee_id: employeeId,
      date,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      clock_in_at: dateAndHHMMToISO(date, startTime),
      clock_out_at: dateAndHHMMToISO(date, endTime),
      actual_start: startTime,
      actual_end: endTime,
      approved_start_mode: 'actual',
      approved_end_mode: 'actual',
      status: 'approved',
      reviewed_at: now,
      pause_15min: pause15min,
      had_snack: hadSnack,
      ate_work_food: ateWorkFood,
      note: note.trim() || null,
    });

    if (error) {
      toast.error(
        error.code === '23505'
          ? 'Un pointage existe déjà pour cet employé à cette date.'
          : 'Impossible de créer le pointage.'
      );
      setSubmitting(false);
      return;
    }

    await syncScheduleFromApproved(supabase, employeeId, date, startTime, endTime);
    await usePlanningStore.getState().loadData({ silent: true });
    toast.success('Pointage ajouté — la journée apparaît dans le planning réel');
    setSubmitting(false);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un pointage</DialogTitle>
          <DialogDescription>
            Saisissez manuellement une journée oubliée. Elle sera ajoutée
            directement au planning réel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="manual-employee">Employé</Label>
            <select
              id="manual-employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            >
              <option value="">Choisir un employé…</option>
              {activeEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-date">Date</Label>
            <input
              id="manual-date"
              type="date"
              value={date}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          {loadingContext && employeeId && date && (
            <p className="text-xs text-slate-400">Chargement du planning…</p>
          )}

          {existingPunch && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              Un pointage existe déjà pour cet employé à cette date.
            </p>
          )}

          {needsShiftPick && employeeId && date && !existingPunch && (
            <div className="space-y-1.5">
              <Label htmlFor="manual-shift">Shift travail</Label>
              <select
                id="manual-shift"
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              >
                <option value="">Choisir un shift…</option>
                {workShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shortName} — {s.startTime}–{s.endTime}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                Aucun shift planifié ce jour — choisissez le type de journée
                travaillée.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-start">Heure de début</Label>
              <input
                id="manual-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-end">Heure de fin</Label>
              <input
                id="manual-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={pause15min}
                onChange={(e) => setPause15min(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm text-slate-700">Pause 15 min</span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hadSnack}
                onChange={(e) => setHadSnack(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm text-slate-700">Collation</span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={ateWorkFood}
                onChange={(e) => setAteWorkFood(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm text-slate-700">Repas travail</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-note">Note (optionnel)</Label>
            <Textarea
              id="manual-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Commentaire sur cette journée…"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={submitting || existingPunch || !employeeId}
            onClick={() => void handleSave()}
          >
            {submitting ? 'Enregistrement…' : 'Créer le pointage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
