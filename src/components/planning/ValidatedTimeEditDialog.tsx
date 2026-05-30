'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
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
  onDelete?: () => Promise<void>;
}

/** Dialogue pour modifier ou supprimer les heures réelles validées (planning réel). */
export function ValidatedTimeEditDialog({
  target,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: ValidatedTimeEditDialogProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!target || !open) return;
    setStart(target.validatedStart);
    setEnd(target.validatedEnd);
    setDeleteConfirmOpen(false);
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

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier les heures réelles</DialogTitle>
            <DialogDescription className="text-left">
              <span className="block font-medium text-slate-700">
                {target.employeeName} — {target.dateLabel}
              </span>
              {target.shiftLabel ? (
                <span className="block mt-0.5">{target.shiftLabel}</span>
              ) : null}
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
                Durée :{' '}
                <span className="font-semibold text-slate-700">{formatHours(duration)}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            {onDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                disabled={submitting}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                Supprimer cette journée
              </Button>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:ml-auto">
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => void handleSave()}
                disabled={submitting || !start || !end || duration <= 0}
              >
                {submitting ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer cette journée ?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-slate-500">
                <p>
                  {target.employeeName} — {target.dateLabel}
                </p>
                <p>
                  La journée disparaîtra du planning réel et le pointage sera supprimé.
                  L’employé pourra pointer à nouveau ce jour-là si besoin.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleting}
            >
              Retour
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? 'Suppression…' : 'Confirmer la suppression'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
