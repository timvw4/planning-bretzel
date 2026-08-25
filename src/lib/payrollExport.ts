// ============================================================
// EXPORT COMPTABLE — Récapitulatif des heures (Excel / PDF)
// ============================================================
// Différent de l'export planning : ici on produit un document
// destiné à la paie (totaux par employé + journal détaillé).

import { Employee, ScheduleEntry, Shift } from './types';
import {
  formatHours,
  getContractLabel,
  getValidatedEntryGrossHours,
  hasValidatedTimes,
} from './utils';
import {
  defaultBreakMinutes,
  formatBreakMinutes,
  isBreakBelowLegal,
  netWorkedHours,
} from './swissBreaks';
import { getPositionLabel } from './employeePosition';
import { format, eachDayOfInterval, parseISO, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';

/** Options repas / pause déclarées par l'employé en fin de service. */
export interface PayrollDeclarationFlags {
  pause_15min: boolean;
  pause_minutes: number;
  had_snack: boolean;
  ate_work_food: boolean;
}

export interface PayrollExportInput {
  employees: Employee[];
  shifts: Shift[];
  entries: ScheduleEntry[];
  /** Bornes strictes de la période de paie (généralement le mois). */
  periodStart: string;
  periodEnd: string;
  companyName: string;
  holidays?: { date: string; name: string }[];
  /** Réglage « déduire les pauses des heures payées ». */
  deductBreaks?: boolean;
  getDeclarations?: (
    employeeId: string,
    date: string
  ) => PayrollDeclarationFlags | undefined;
}

interface PayrollDayRow {
  date: string;
  dayLabel: string;
  shiftName: string;
  start: string;
  end: string;
  /** Amplitude fin − début. */
  grossHours: number;
  breakMinutes: number;
  /** Heures retenues pour la paie (brut moins pause si elle est déduite). */
  hours: number;
  /** Pause en dessous du minimum légal pour la durée travaillée. */
  breakBelowLegal: boolean;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName: string;
  hadSnack: boolean;
  ateWorkFood: boolean;
}

interface PayrollEmployeeRow {
  employee: Employee;
  daysWorked: number;
  totalGrossHours: number;
  totalBreakMinutes: number;
  totalHours: number;
  sundayHours: number;
  sundayDays: number;
  holidayHours: number;
  holidayDays: number;
  snackCount: number;
  workMealCount: number;
  shortBreakCount: number;
  days: PayrollDayRow[];
}

/** Heures en décimal (42.5) — format attendu par la plupart des logiciels de paie. */
function toDecimal(hours: number): number {
  return Math.round(hours * 100) / 100;
}

function buildPayrollData(input: PayrollExportInput): PayrollEmployeeRow[] {
  const {
    employees,
    shifts,
    entries,
    periodStart,
    periodEnd,
    holidays,
    deductBreaks,
    getDeclarations,
  } = input;
  const hoursOptions = { deductBreaks: deductBreaks === true };

  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const holidayMap = new Map((holidays ?? []).map((h) => [h.date, h.name]));
  const days = eachDayOfInterval({
    start: parseISO(periodStart),
    end: parseISO(periodEnd),
  });

  return employees.map((employee) => {
    const dayRows: PayrollDayRow[] = [];

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = entries.find(
        (e) => e.employeeId === employee.id && e.date === dateStr
      );
      if (!entry || !hasValidatedTimes(entry)) continue;

      const shift = shiftMap.get(entry.shiftId);
      const flags = getDeclarations?.(employee.id, dateStr);
      const holidayName = holidayMap.get(dateStr) ?? '';
      // La pause retenue sur la journée validée fait référence ; à défaut,
      // on reprend la déclaration de fin de service.
      const breakMinutes =
        entry.validatedBreakMinutes ??
        defaultBreakMinutes(flags?.pause_minutes, flags?.pause_15min);
      const grossHours = getValidatedEntryGrossHours(entry);

      dayRows.push({
        date: dateStr,
        dayLabel: format(day, 'EEEE d MMMM', { locale: fr }),
        shiftName: shift?.name ?? '',
        start: entry.validatedStart ?? '',
        end: entry.validatedEnd ?? '',
        grossHours,
        breakMinutes,
        hours: netWorkedHours(grossHours, breakMinutes, hoursOptions.deductBreaks),
        breakBelowLegal: isBreakBelowLegal(grossHours, breakMinutes),
        isSunday: getDay(day) === 0,
        isHoliday: holidayMap.has(dateStr),
        holidayName,
        hadSnack: flags?.had_snack ?? false,
        ateWorkFood: flags?.ate_work_food ?? false,
      });
    }

    const totalHours = dayRows.reduce((sum, d) => sum + d.hours, 0);
    const sundayRows = dayRows.filter((d) => d.isSunday);
    const holidayRows = dayRows.filter((d) => d.isHoliday);

    return {
      employee,
      daysWorked: dayRows.length,
      totalGrossHours: dayRows.reduce((sum, d) => sum + d.grossHours, 0),
      totalBreakMinutes: dayRows.reduce((sum, d) => sum + d.breakMinutes, 0),
      totalHours,
      sundayHours: sundayRows.reduce((sum, d) => sum + d.hours, 0),
      sundayDays: sundayRows.length,
      holidayHours: holidayRows.reduce((sum, d) => sum + d.hours, 0),
      holidayDays: holidayRows.length,
      snackCount: dayRows.filter((d) => d.hadSnack).length,
      workMealCount: dayRows.filter((d) => d.ateWorkFood).length,
      shortBreakCount: dayRows.filter((d) => d.breakBelowLegal).length,
      days: dayRows,
    };
  });
}

function periodLabels(periodStart: string, periodEnd: string) {
  const monthLabel = format(parseISO(periodStart), 'MMMM yyyy', { locale: fr });
  const rangeLabel = `${format(parseISO(periodStart), 'd MMMM yyyy', { locale: fr })} au ${format(
    parseISO(periodEnd),
    'd MMMM yyyy',
    { locale: fr }
  )}`;
  return { monthLabel, rangeLabel };
}

// ---- EXPORT EXCEL COMPTABLE ----
export async function exportPayrollExcel(input: PayrollExportInput): Promise<void> {
  const XLSX = await import('xlsx');
  const { periodStart, periodEnd, companyName } = input;
  const data = buildPayrollData(input);
  const { monthLabel, rangeLabel } = periodLabels(periodStart, periodEnd);

  const generatedAt = format(new Date(), "d MMMM yyyy 'à' HH:mm", { locale: fr });

  // ── Feuille 1 : récapitulatif par employé ──────────────────
  const recapHeaders = [
    'Nom',
    'Prénom',
    'Poste',
    'Type de contrat',
    'Heures contrat / semaine',
    'Jours travaillés',
    'Amplitude totale (h:min)',
    'Total pauses',
    'Total heures payées (h:min)',
    'Total heures payées (décimal)',
    'Dont dimanche (h)',
    'Jours dimanche',
    'Dont jours fériés (h)',
    'Jours fériés',
    'Collations',
    'Repas au travail',
    'Jours à pause insuffisante',
  ];

  const recapRows = data.map((row) => [
    row.employee.lastName ?? '',
    row.employee.firstName,
    getPositionLabel(row.employee.position),
    getContractLabel(row.employee.contractType),
    row.employee.contractHours ?? '',
    row.daysWorked,
    formatHours(row.totalGrossHours),
    formatBreakMinutes(row.totalBreakMinutes),
    formatHours(row.totalHours),
    toDecimal(row.totalHours),
    toDecimal(row.sundayHours),
    row.sundayDays,
    toDecimal(row.holidayHours),
    row.holidayDays,
    row.snackCount,
    row.workMealCount,
    row.shortBreakCount,
  ]);

  const totals = data.reduce(
    (acc, row) => ({
      daysWorked: acc.daysWorked + row.daysWorked,
      totalGrossHours: acc.totalGrossHours + row.totalGrossHours,
      totalBreakMinutes: acc.totalBreakMinutes + row.totalBreakMinutes,
      totalHours: acc.totalHours + row.totalHours,
      sundayHours: acc.sundayHours + row.sundayHours,
      sundayDays: acc.sundayDays + row.sundayDays,
      holidayHours: acc.holidayHours + row.holidayHours,
      holidayDays: acc.holidayDays + row.holidayDays,
      snackCount: acc.snackCount + row.snackCount,
      workMealCount: acc.workMealCount + row.workMealCount,
      shortBreakCount: acc.shortBreakCount + row.shortBreakCount,
    }),
    {
      daysWorked: 0,
      totalGrossHours: 0,
      totalBreakMinutes: 0,
      totalHours: 0,
      sundayHours: 0,
      sundayDays: 0,
      holidayHours: 0,
      holidayDays: 0,
      snackCount: 0,
      workMealCount: 0,
      shortBreakCount: 0,
    }
  );

  const totalRow = [
    'TOTAL',
    '',
    '',
    '',
    '',
    totals.daysWorked,
    formatHours(totals.totalGrossHours),
    formatBreakMinutes(totals.totalBreakMinutes),
    formatHours(totals.totalHours),
    toDecimal(totals.totalHours),
    toDecimal(totals.sundayHours),
    totals.sundayDays,
    toDecimal(totals.holidayHours),
    totals.holidayDays,
    totals.snackCount,
    totals.workMealCount,
    totals.shortBreakCount,
  ];

  const recapSheet = XLSX.utils.aoa_to_sheet([
    [companyName],
    [`Récapitulatif des heures — ${monthLabel}`],
    [`Période : ${rangeLabel}`],
    [`Document généré le ${generatedAt}`],
    [],
    recapHeaders,
    ...recapRows,
    [],
    totalRow,
  ]);

  recapSheet['!cols'] = [
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 22 },
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 24 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 13 },
    { wch: 11 },
    { wch: 16 },
    { wch: 24 },
  ];

  // ── Feuille 2 : journal détaillé jour par jour ─────────────
  const detailHeaders = [
    'Employé',
    'Date',
    'Jour',
    'Shift',
    'Début',
    'Fin',
    'Amplitude (h:min)',
    'Pause',
    'Heures payées (h:min)',
    'Heures payées (décimal)',
    'Dimanche',
    'Jour férié',
    'Pause insuffisante',
    'Collation',
    'Repas au travail',
  ];

  const detailRows: (string | number)[][] = [];
  for (const row of data) {
    const name = `${row.employee.firstName}${row.employee.lastName ? ` ${row.employee.lastName}` : ''}`;
    for (const day of row.days) {
      detailRows.push([
        name,
        day.date,
        day.dayLabel,
        day.shiftName,
        day.start,
        day.end,
        formatHours(day.grossHours),
        formatBreakMinutes(day.breakMinutes),
        formatHours(day.hours),
        toDecimal(day.hours),
        day.isSunday ? 'Oui' : '',
        day.isHoliday ? day.holidayName || 'Oui' : '',
        day.breakBelowLegal ? 'Oui' : '',
        day.hadSnack ? 'Oui' : '',
        day.ateWorkFood ? 'Oui' : '',
      ]);
    }
  }

  const detailSheet = XLSX.utils.aoa_to_sheet([
    [companyName],
    [`Journal détaillé — ${monthLabel}`],
    [`Période : ${rangeLabel}`],
    [],
    detailHeaders,
    ...detailRows,
  ]);

  detailSheet['!cols'] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 22 },
    { wch: 18 },
    { wch: 8 },
    { wch: 8 },
    { wch: 18 },
    { wch: 10 },
    { wch: 22 },
    { wch: 22 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 11 },
    { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, recapSheet, 'Récapitulatif');
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Journal détaillé');

  wb.Props = {
    Title: `Récapitulatif heures ${monthLabel} — ${companyName}`,
    Subject: `Heures validées du ${periodStart} au ${periodEnd}`,
    Author: companyName,
    CreatedDate: new Date(),
  };

  XLSX.writeFile(wb, `recap-comptable-${periodStart}-${periodEnd}.xlsx`);
}

// ---- EXPORT PDF COMPTABLE ----
export async function exportPayrollPDF(input: PayrollExportInput): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const { periodStart, periodEnd, companyName } = input;
  const data = buildPayrollData(input);
  const { monthLabel, rangeLabel } = periodLabels(periodStart, periodEnd);

  const PAGE_W = 210; // A4 portrait
  const PAGE_H = 297;
  const MARGIN = 14;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── En-tête document ──────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(companyName, MARGIN, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(`Récapitulatif des heures — ${monthLabel}`, MARGIN, 27);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Période : ${rangeLabel}`, MARGIN, 33);
  doc.text(
    `Document généré le ${format(new Date(), "d MMMM yyyy 'à' HH:mm", { locale: fr })}`,
    MARGIN,
    38
  );

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 42, PAGE_W - MARGIN, 42);

  // ── Tableau récapitulatif ─────────────────────────────────
  const headers = [
    'Employé',
    'Contrat',
    'Jours',
    'Amplitude',
    'Pauses',
    'Payées',
    'Décimal',
    'Dim.',
    'Fériés',
    'Repas',
  ];

  const rows = data.map((row) => [
    `${row.employee.firstName}${row.employee.lastName ? ` ${row.employee.lastName}` : ''}`,
    getContractLabel(row.employee.contractType),
    String(row.daysWorked),
    formatHours(row.totalGrossHours),
    formatBreakMinutes(row.totalBreakMinutes),
    formatHours(row.totalHours),
    toDecimal(row.totalHours).toFixed(2),
    row.sundayDays > 0 ? `${row.sundayDays} j / ${formatHours(row.sundayHours)}` : '—',
    row.holidayDays > 0 ? `${row.holidayDays} j / ${formatHours(row.holidayHours)}` : '—',
    row.workMealCount > 0 || row.snackCount > 0
      ? `${row.workMealCount} / ${row.snackCount}`
      : '—',
  ]);

  const totalGross = data.reduce((sum, r) => sum + r.totalGrossHours, 0);
  const totalBreaks = data.reduce((sum, r) => sum + r.totalBreakMinutes, 0);
  const totalHours = data.reduce((sum, r) => sum + r.totalHours, 0);
  const totalDays = data.reduce((sum, r) => sum + r.daysWorked, 0);
  const totalMeals = data.reduce((sum, r) => sum + r.workMealCount, 0);
  const totalSnacks = data.reduce((sum, r) => sum + r.snackCount, 0);

  autoTable(doc, {
    head: [headers],
    body: rows,
    foot: [
      [
        'TOTAL',
        '',
        String(totalDays),
        formatHours(totalGross),
        formatBreakMinutes(totalBreaks),
        formatHours(totalHours),
        toDecimal(totalHours).toFixed(2),
        '',
        '',
        `${totalMeals} / ${totalSnacks}`,
      ],
    ],
    startY: 48,
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      lineWidth: 0.1,
      lineColor: [226, 232, 240],
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: 255,
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold', halign: 'left' },
      1: { cellWidth: 20, halign: 'left' },
      2: { cellWidth: 11, halign: 'center' },
      3: { cellWidth: 19, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 20, halign: 'center' },
      8: { cellWidth: 20, halign: 'center' },
      9: { cellWidth: 12, halign: 'center' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursorY = ((doc as any).lastAutoTable?.finalY ?? 120) + 8;

  // ── Notes de lecture ──────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('NOTES', MARGIN, cursorY);
  cursorY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 130, 145);
  const notes = [
    'Heures issues des pointages validés par la direction (planning réel).',
    input.deductBreaks
      ? 'Colonne « Payées » : amplitude moins les pauses (les pauses ne comptent pas comme temps de travail).'
      : 'Colonne « Payées » : amplitude complète — les pauses sont enregistrées mais non déduites.',
    'Colonne « Décimal » : heures au format paie (ex. 42.50 = 42 h 30).',
    'Colonne « Dim. » / « Fériés » : jours et heures travaillés donnant droit à majoration ou compensation.',
    'Colonne « Repas » : repas au travail / collations (repas pris au travail en premier).',
    'Le détail jour par jour est disponible dans la version Excel (onglet « Journal détaillé »).',
  ];
  for (const note of notes) {
    doc.text(`•  ${note}`, MARGIN, cursorY);
    cursorY += 4;
  }

  // ── Zone de visa ──────────────────────────────────────────
  const signatureY = Math.max(cursorY + 12, PAGE_H - 45);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, signatureY, MARGIN + 60, signatureY);
  doc.line(PAGE_W - MARGIN - 60, signatureY, PAGE_W - MARGIN, signatureY);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Visa employeur', MARGIN, signatureY + 4);
  doc.text('Visa fiduciaire / comptable', PAGE_W - MARGIN - 60, signatureY + 4);

  // ── Pied de page ──────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${companyName} — Récapitulatif ${monthLabel}`,
      MARGIN,
      PAGE_H - 8
    );
    doc.text(`Page ${i} / ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 8, {
      align: 'right',
    });
  }

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recap-comptable-${periodStart}-${periodEnd}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
