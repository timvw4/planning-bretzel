'use client';

import { useState, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldOff,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  Users,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { usePlanningStore } from '@/lib/store';
import { formatHours, getEntryDurationHours } from '@/lib/utils';

const MONTHS_TO_SHOW = 12;

export default function ValidationPage() {
  const {
    employees,
    shifts,
    scheduleEntries,
    lockedMonths,
    validateMonth,
    unlockMonth,
    alerts,
  } = usePlanningStore();

  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'validate' | 'unlock';
    monthKey: string;
    monthLabel: string;
  } | null>(null);

  // Générer la liste des 12 derniers mois (hors mois en cours)
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: MONTHS_TO_SHOW }, (_, i) => {
      const date = subMonths(now, i + 1);
      const key = format(date, 'yyyy-MM');
      const label = format(date, 'MMMM yyyy', { locale: fr });
      const start = format(startOfMonth(date), 'yyyy-MM-dd');
      const end = format(endOfMonth(date), 'yyyy-MM-dd');
      const days = eachDayOfInterval({ start: new Date(start), end: new Date(end) });
      const entries = scheduleEntries.filter((e) => e.date >= start && e.date <= end);
      const shiftMap = new Map(shifts.map((s) => [s.id, s]));
      const totalHours = entries.reduce((sum, entry) => {
        const shift = shiftMap.get(entry.shiftId);
        return sum + getEntryDurationHours(entry, shift);
      }, 0);
      const activeEmployees = new Set(entries.map((e) => e.employeeId)).size;
      const isLocked = lockedMonths.includes(key);
      const monthAlerts = alerts.filter(
        (a) => !a.resolved && a.date && a.date >= start && a.date <= end
      );
      return { key, label, start, end, days, entries, totalHours, activeEmployees, isLocked, monthAlerts };
    });
  }, [scheduleEntries, shifts, lockedMonths, alerts]);

  // Récapitulatif du mois sélectionné par employé
  const selectedMonthData = useMemo(() => {
    if (!selectedMonthKey) return null;
    const month = months.find((m) => m.key === selectedMonthKey);
    if (!month) return null;

    const shiftMap = new Map(shifts.map((s) => [s.id, s]));
    const activeEmps = employees.filter(
      (e) => e.isActive && !(e.inactiveMonths ?? []).includes(month.key)
    );

    const rows = activeEmps.map((emp) => {
      const empEntries = month.entries.filter((e) => e.employeeId === emp.id);
      const totalHours = empEntries.reduce((sum, entry) => {
        const shift = shiftMap.get(entry.shiftId);
        return sum + getEntryDurationHours(entry, shift);
      }, 0);
      const shiftCounts: Record<string, number> = {};
      empEntries.forEach((entry) => {
        const s = shiftMap.get(entry.shiftId);
        if (s) shiftCounts[s.shortName] = (shiftCounts[s.shortName] ?? 0) + 1;
      });
      return { employee: emp, totalHours, shiftCounts, entriesCount: empEntries.length };
    });

    return { month, rows };
  }, [selectedMonthKey, months, employees, shifts]);

  const handleConfirm = () => {
    if (!confirmDialog) return;
    if (confirmDialog.type === 'validate') {
      validateMonth(confirmDialog.monthKey);
      toast.success(`Mois de ${confirmDialog.monthLabel} validé et verrouillé`);
    } else {
      unlockMonth(confirmDialog.monthKey);
      toast.success(`Mois de ${confirmDialog.monthLabel} déverrouillé`);
    }
    setConfirmDialog(null);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header
        title="Validation des mois"
        subtitle="Consultez, validez et verrouillez les mois passés"
      />

      <div className="flex-1 p-6 flex gap-6">

        {/* Colonne gauche : liste des mois */}
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">
            12 derniers mois
          </h2>
          <div className="flex flex-col gap-1.5">
            {months.map((month) => {
              const isSelected = selectedMonthKey === month.key;
              return (
                <button
                  key={month.key}
                  onClick={() => setSelectedMonthKey(month.key)}
                  className={`w-full text-left rounded-xl px-4 py-3 border transition-all duration-150 flex items-center justify-between group ${
                    isSelected
                      ? 'bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-200'
                      : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {month.isLocked ? (
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <Lock className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 capitalize truncate">
                        {month.label}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {month.entries.length} entrée{month.entries.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {month.isLocked ? (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                        Validé
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                        À valider
                      </span>
                    )}
                    <ChevronRight className={`h-3.5 w-3.5 transition-colors ${isSelected ? 'text-indigo-400' : 'text-slate-300 group-hover:text-slate-400'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Colonne droite : récapitulatif */}
        <div className="flex-1 min-w-0">
          {!selectedMonthData ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-24">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <ShieldCheck className="h-8 w-8 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Sélectionnez un mois</p>
              <p className="text-xs text-slate-400 mt-1">
                Choisissez un mois dans la liste pour voir son récapitulatif
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">

              {/* En-tête du mois sélectionné */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 capitalize">
                      {selectedMonthData.month.label}
                    </h3>
                    <p className="text-sm text-slate-400 mt-0.5">
                      Du {format(new Date(selectedMonthData.month.start), 'd MMMM', { locale: fr })} au{' '}
                      {format(new Date(selectedMonthData.month.end), 'd MMMM yyyy', { locale: fr })}
                    </p>
                  </div>

                  {selectedMonthData.month.isLocked ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-3 py-2">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-semibold">Mois validé</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirmDialog({
                            type: 'unlock',
                            monthKey: selectedMonthData.month.key,
                            monthLabel: selectedMonthData.month.label,
                          })
                        }
                        className="text-slate-500 border-slate-200 hover:border-red-200 hover:text-red-500"
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        Déverrouiller
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() =>
                        setConfirmDialog({
                          type: 'validate',
                          monthKey: selectedMonthData.month.key,
                          monthLabel: selectedMonthData.month.label,
                        })
                      }
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Valider ce mois
                    </Button>
                  )}
                </div>

                {/* Stats rapides */}
                <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900">
                      {formatHours(selectedMonthData.month.totalHours)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Heures (prévu ou validé)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900">
                      {selectedMonthData.month.activeEmployees}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Employés actifs</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${selectedMonthData.month.monthAlerts.length > 0 ? 'text-amber-500' : 'text-slate-900'}`}>
                      {selectedMonthData.month.monthAlerts.length}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Alertes non résolues</p>
                  </div>
                </div>

                {/* Alertes du mois */}
                {selectedMonthData.month.monthAlerts.length > 0 && (
                  <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700">
                      Ce mois contient {selectedMonthData.month.monthAlerts.length} alerte{selectedMonthData.month.monthAlerts.length > 1 ? 's' : ''} non résolue{selectedMonthData.month.monthAlerts.length > 1 ? 's' : ''}. Il est conseillé de les résoudre avant de valider.
                    </p>
                  </div>
                )}
              </div>

              {/* Tableau récapitulatif par employé */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm [overflow:clip]">
                <div className="px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400" />
                    <h4 className="text-sm font-semibold text-slate-700">Récapitulatif par employé</h4>
                  </div>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-slate-50/70 border-b border-slate-100">
                    <tr>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">
                        Employé
                      </th>
                      <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">
                        Jours planifiés
                      </th>
                      <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">
                        Heures totales
                      </th>
                      <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-3">
                        Contrat / sem.
                      </th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">
                        Shifts utilisés
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMonthData.rows.map((row, i) => (
                      <tr
                        key={row.employee.id}
                        className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                              style={{ backgroundColor: row.employee.color }}
                            >
                              {row.employee.firstName.charAt(0)}{row.employee.lastName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-800">
                                {row.employee.firstName} {row.employee.lastName}
                              </p>
                              {row.employee.role && (
                                <p className="text-[11px] text-slate-400">{row.employee.role}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`text-sm font-semibold ${row.entriesCount > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                            {row.entriesCount}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`text-sm font-bold ${row.totalHours > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                            {formatHours(row.totalHours)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-sm text-slate-500">
                            {row.employee.contractHours}h
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(row.shiftCounts).map(([shortName, count]) => {
                              const shift = shifts.find((s) => s.shortName === shortName);
                              return (
                                <span
                                  key={shortName}
                                  className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                                  style={{
                                    backgroundColor: shift?.color ?? '#F1F5F9',
                                    color: shift?.textColor ?? '#475569',
                                  }}
                                >
                                  {shortName} ×{count}
                                </span>
                              );
                            })}
                            {row.entriesCount === 0 && (
                              <span className="text-xs text-slate-300">Aucun shift</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Dialog de confirmation */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog?.type === 'validate' ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Valider le mois
                </>
              ) : (
                <>
                  <ShieldOff className="h-5 w-5 text-amber-500" />
                  Déverrouiller le mois
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            {confirmDialog?.type === 'validate' ? (
              <p className="text-sm text-slate-600">
                Vous êtes sur le point de valider le mois de{' '}
                <span className="font-semibold text-slate-900 capitalize">{confirmDialog?.monthLabel}</span>.
                <br /><br />
                Le planning de ce mois sera <strong>verrouillé</strong> et ne pourra plus être modifié.
                Vous pourrez déverrouiller le mois en cas d'erreur.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Vous êtes sur le point de déverrouiller le mois de{' '}
                <span className="font-semibold text-slate-900 capitalize">{confirmDialog?.monthLabel}</span>.
                <br /><br />
                Le planning de ce mois redeviendra <strong>modifiable</strong>.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Annuler
            </Button>
            <Button
              onClick={handleConfirm}
              className={confirmDialog?.type === 'validate'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'}
            >
              {confirmDialog?.type === 'validate' ? 'Confirmer la validation' : 'Déverrouiller'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
