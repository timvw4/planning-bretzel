'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calculateShiftDuration, formatHours } from '@/lib/utils';

export interface ValidatedTimeEditTarget {
  employeeId: string;
  employeeName: string;
  date: string;
  dateLabel: string;
  shiftLabel: string;
  validatedStart: string;
  validatedEnd: string;
  plannedStart?: string;
  plannedEnd?: string;
}

interface ValidatedTimeEditDialogProps {
  target: ValidatedTimeEditTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (start: string, end: string) => Promise<void>;
}

/** Dialogue pour modifier les heures réelles validées (planning réel). */
export function ValidatedTimeEditDialog({
  target,
  open,
  onOpenChange,
  onSave,
}: ValidatedTimeEditDialogProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!target || !open) return;
    setStart(target.validatedStart);
    setEnd(target.validatedEnd);
  }, [target, open]);

  if (!target) return null;

  const duration =
    start && end && calculateShiftDuration(start, end) > 0
      ? calculateShiftDuration(start, end)
      : 0;

  const handleSave = async () => {
    if (!start || !end) return;
    if (calculateShiftDuration(start, end) <= 0) return;
    setSubmitting(true);
    try {
      await onSave(start, end);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier les heures réelles</DialogTitle>
          <DialogDescription>
            {target.employeeName} — {target.dateLabel}
            {target.shiftLabel ? ` · ${target.shiftLabel}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(target.plannedStart || target.plannedEnd) && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs">
              <p className="font-bold text-slate-400 uppercase tracking-wide mb-1">
                Horaires prévus
              </p>
              <p className="font-semibold text-slate-700">
                {target.plannedStart ?? '—'} – {target.plannedEnd ?? '—'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Début</label>
              <Input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Fin</label>
              <Input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          {duration > 0 && (
            <p className="text-xs text-slate-500">
              Durée : <span className="font-semibold text-slate-700">{formatHours(duration)}</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={submitting || !start || !end || duration <= 0}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
