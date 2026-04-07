'use client';

import { usePlanningStore } from '@/lib/store';
import { Shift } from '@/lib/types';
import { formatHours } from '@/lib/utils';
import { X } from 'lucide-react';

interface ShiftPickerProps {
  onSelect: (shiftId: string) => void;
  onClear: () => void;
  currentShiftId?: string;
  employeeName?: string;
  dateLabel?: string;
}

export function ShiftPicker({
  onSelect,
  onClear,
  currentShiftId,
  employeeName,
  dateLabel,
}: ShiftPickerProps) {
  const { shifts } = usePlanningStore();
  const activeShifts = shifts.filter((s) => s.isActive);

  const workShifts = activeShifts.filter((s) => s.type === 'work');
  const absenceShifts = activeShifts.filter((s) => s.type !== 'work');

  const renderShift = (shift: Shift) => (
    <button
      key={shift.id}
      onClick={() => onSelect(shift.id)}
      className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-left transition-all hover:scale-[1.01] ${
        currentShiftId === shift.id
          ? 'ring-2 ring-offset-1 ring-indigo-500'
          : 'hover:bg-slate-50'
      }`}
    >
      <span
        className="w-10 h-7 flex items-center justify-center rounded-lg text-[11px] font-bold shrink-0"
        style={{ backgroundColor: shift.color, color: shift.textColor }}
      >
        {shift.shortName}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800">{shift.name}</p>
        {shift.durationHours > 0 ? (
          <p className="text-[10px] text-slate-400">
            {shift.startTime} – {shift.endTime} · {formatHours(shift.durationHours)}
          </p>
        ) : (
          <p className="text-[10px] text-slate-400">Sans horaire</p>
        )}
      </div>
      {currentShiftId === shift.id && (
        <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
      )}
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-64 z-50 flex flex-col overflow-hidden" style={{ maxHeight: 'min(420px, 80vh)' }}>
      {/* En-tête — fixe, ne scroll pas */}
      {(employeeName || dateLabel) && (
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-100">
          {employeeName && (
            <p className="text-xs font-semibold text-slate-800">{employeeName}</p>
          )}
          {dateLabel && (
            <p className="text-[10px] text-slate-500 capitalize">{dateLabel}</p>
          )}
        </div>
      )}

      {/* Zone scrollable */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {/* Shifts de travail */}
        {workShifts.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 px-1">
              Shifts de travail
            </p>
            <div className="space-y-0.5">{workShifts.map(renderShift)}</div>
          </div>
        )}

        {/* Absences & repos */}
        {absenceShifts.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 px-1">
              Absences & repos
            </p>
            <div className="space-y-0.5">{absenceShifts.map(renderShift)}</div>
          </div>
        )}
      </div>

      {/* Effacer — fixe en bas */}
      {currentShiftId && (
        <div className="shrink-0 border-t border-slate-100">
          <button
            onClick={onClear}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Effacer l'assignation
          </button>
        </div>
      )}
    </div>
  );
}
