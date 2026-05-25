// ============================================================
// MODULE D'EXPORT — Excel et PDF
// ============================================================

import { Employee, Shift, ScheduleEntry } from './types';
import { formatHours } from './utils';
import { getPositionLabel } from './employeePosition';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

// ---- EXPORT EXCEL ----
export async function exportToExcel(
  employees: Employee[],
  shifts: Shift[],
  entries: ScheduleEntry[],
  periodStart: string,
  periodEnd: string,
  companyName: string,
  // monthRef : premier jour du mois de référence (pour le filtre des inactifs).
  // Utile quand periodStart est étendu aux semaines complètes (peut être dans le mois précédent).
  monthRef?: string
): Promise<void> {
  const XLSX = await import('xlsx');

  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const days = eachDayOfInterval({ start: parseISO(periodStart), end: parseISO(periodEnd) });

  // Construire les données du tableau
  const headers = [
    'Employé',
    'Poste',
    ...days.map((d) => format(d, 'EEE d/MM', { locale: fr })),
    'Total heures',
  ];

  const excelMonthKey = format(parseISO(monthRef ?? periodStart), 'yyyy-MM');
  const rows = employees
    .filter((e) => e.isActive && !(e.inactiveMonths ?? []).includes(excelMonthKey))
    .map((emp) => {
      const shiftCells = days.map((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const entry = entries.find((e) => e.employeeId === emp.id && e.date === dateStr);
        if (!entry) return '';
        const shift = shiftMap.get(entry.shiftId);
        return shift ? shift.shortName : '';
      });

      const totalHours = days.reduce((sum, day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const entry = entries.find((e) => e.employeeId === emp.id && e.date === dateStr);
        const shift = entry ? shiftMap.get(entry.shiftId) : null;
        return sum + (shift?.durationHours ?? 0);
      }, 0);

      return [`${emp.firstName} ${emp.lastName}`, getPositionLabel(emp.position), ...shiftCells, formatHours(totalHours)];
    });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Styles de base
  ws['!cols'] = [
    { wch: 20 }, // Employé
    { wch: 18 }, // Poste
    ...days.map(() => ({ wch: 8 })),
    { wch: 10 }, // Total
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planning');

  // Métadonnées
  wb.Props = {
    Title: `Planning ${companyName}`,
    Subject: `Planning du ${periodStart} au ${periodEnd}`,
    Author: companyName,
    CreatedDate: new Date(),
  };

  XLSX.writeFile(wb, `planning-${periodStart}-${periodEnd}.xlsx`);
}

// ---- EXPORT PDF ----
export async function exportToPDF(
  employees: Employee[],
  shifts: Shift[],
  entries: ScheduleEntry[],
  periodStart: string,
  periodEnd: string,
  companyName: string,
  // monthRef : premier jour du mois de référence pour le titre et le filtre des inactifs.
  monthRef?: string,
  // holidays : liste des jours fériés pour mise en évidence dans le PDF
  holidays?: { date: string; name: string }[]
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const days = eachDayOfInterval({ start: parseISO(periodStart), end: parseISO(periodEnd) });

  // ── A4 paysage — tableau unique, une seule page ────────────
  const PAGE_W = 297; // A4 landscape width
  const PAGE_H = 210; // A4 landscape height
  const MARGIN = 8;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // ── Utilitaires couleur ───────────────────────────────────
  const parseHex = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  };

  const hexToHue = (hex: string): number => {
    const [r, g, b] = parseHex(hex).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) return 360;
    let hVal = 0;
    if (max === r)      hVal = ((g - b) / delta) % 6;
    else if (max === g) hVal = (b - r) / delta + 2;
    else                hVal = (r - g) / delta + 4;
    hVal *= 60;
    return hVal < 0 ? hVal + 360 : hVal;
  };

  // ── Employés actifs du mois ────────────────────────────────
  const periodMonthKey = format(parseISO(monthRef ?? periodStart), 'yyyy-MM');
  const activeEmployees = employees.filter(
    (e) => e.isActive && !(e.inactiveMonths ?? []).includes(periodMonthKey)
  );
  const employeeColors = activeEmployees.map((e) => e.color);

  // ── Jours fériés ──────────────────────────────────────────
  const holidaySet = new Set((holidays ?? []).map((h) => h.date));

  // ── Largeurs colonnes ─────────────────────────────────────
  const usableW = PAGE_W - 2 * MARGIN;
  const COL_EMP = 28;
  const COL_TOT = 13;
  const COL_DAY = parseFloat(((usableW - COL_EMP - COL_TOT) / days.length).toFixed(2));

  // ── En-têtes et données ───────────────────────────────────
  const headers = [
    'Employé',
    ...days.map((d) => format(d, 'EE\nd', { locale: fr })),
    'Total',
  ];

  const rows = activeEmployees.map((emp) => {
    const shiftCells = days.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = entries.find((e) => e.employeeId === emp.id && e.date === dateStr);
      if (!entry) return '';
      const shift = shiftMap.get(entry.shiftId);
      return shift ? shift.shortName : '';
    });

    const totalHours = days.reduce((sum, day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = entries.find((e) => e.employeeId === emp.id && e.date === dateStr);
      const shift = entry ? shiftMap.get(entry.shiftId) : null;
      return sum + (shift?.durationHours ?? 0);
    }, 0);

    return [`${emp.firstName} ${emp.lastName}`, ...shiftCells, formatHours(totalHours)];
  });

  // ── Styles de colonnes ────────────────────────────────────
  const colStyles: Record<number, object> = {
    0: { cellWidth: COL_EMP, fontStyle: 'bold', overflow: 'hidden' },
    [headers.length - 1]: { cellWidth: COL_TOT, halign: 'center', fontStyle: 'bold', overflow: 'hidden' },
  };
  for (let i = 1; i < headers.length - 1; i++) {
    colStyles[i] = { cellWidth: COL_DAY, halign: 'center', overflow: 'hidden' };
  }

  // ── En-tête de page ───────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(companyName, MARGIN, 10);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  const monthLabel = format(parseISO(monthRef ?? periodStart), 'MMMM yyyy', { locale: fr });
  const periodLabel = `  -  ${format(parseISO(periodStart), 'd MMM', { locale: fr })} au ${format(parseISO(periodEnd), 'd MMM yyyy', { locale: fr })}`;
  doc.text(`Planning ${monthLabel}${periodLabel}`, MARGIN + 32, 10);
  doc.setTextColor(0);

  // ── Tableau unique ────────────────────────────────────────
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 13,
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      fontSize: 5.5,
      cellPadding: 0.8,
      lineWidth: 0.1,
      overflow: 'hidden',
    },
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: 255,
      fontSize: 5.5,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: colStyles,
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      const col = data.column.index;

      // Colonne Employé : fond pastel de la couleur de l'employé
      if (col === 0 && data.section === 'body') {
        const empColor = employeeColors[data.row.index];
        if (empColor) {
          const [r, g, b] = parseHex(empColor);
          data.cell.styles.fillColor = [
            Math.round(r * 0.25 + 255 * 0.75),
            Math.round(g * 0.25 + 255 * 0.75),
            Math.round(b * 0.25 + 255 * 0.75),
          ];
          data.cell.styles.textColor = [r, g, b];
        }
      }

      // Colonnes de jours
      const isDayCol = col >= 1 && col < headers.length - 1;
      if (isDayCol) {
        const day = days[col - 1];
        const dateStr = format(day, 'yyyy-MM-dd');
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const isHoliday = holidaySet.has(dateStr);

        if (isHoliday) {
          // Jour férié : ambré
          if (data.section === 'head') {
            data.cell.styles.fillColor = [217, 119, 6]; // amber-600
          } else if (!data.cell.raw) {
            data.cell.styles.fillColor = [255, 251, 235]; // amber-50
          }
        } else if (isWeekend) {
          // Week-end : gris
          if (data.section === 'head') {
            data.cell.styles.fillColor = [140, 140, 140];
          } else if (!data.cell.raw) {
            data.cell.styles.fillColor = [225, 225, 225];
          }
        }

        // Shift assigné : couleur du shift
        if (data.section === 'body') {
          const cellText = String(data.cell.raw || '');
          const shift = shifts.find((s) => s.shortName === cellText);
          if (shift) {
            data.cell.styles.fillColor = parseHex(shift.color);
            data.cell.styles.textColor = parseHex(shift.textColor);
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.halign = 'center';
          }
        }
      }
    },
  });

  // ── Légende horizontale sous le tableau ───────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableEndY = ((doc as any).lastAutoTable?.finalY ?? 150) + 4;

  const activeShifts = [...shifts.filter((s) => s.isActive)].sort(
    (a, b) => hexToHue(a.color) - hexToHue(b.color)
  );

  // Chaque item : [rect] Nom sur ligne 1, horaire sur ligne 2
  // ITEM_W plus large pour que les noms longs tiennent sans troncature
  const RECT_W   = 6;
  const RECT_H   = 3.2;
  const ITEM_W   = 52;          // largeur de colonne de légende
  const ROW_H    = 7.5;         // hauteur d'un item (deux lignes de texte)
  const COLS     = Math.floor(usableW / ITEM_W);
  const TEXT_X_OFFSET = RECT_W + 1.5;

  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(120);
  doc.text('LÉGENDE', MARGIN, tableEndY);

  activeShifts.forEach((shift, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const x = MARGIN + col * ITEM_W;
    const y = tableEndY + 4 + row * ROW_H;

    const [r, g, b]    = parseHex(shift.color);
    const [tr, tg, tb] = parseHex(shift.textColor);

    // Rectangle coloré avec abréviation
    doc.setFillColor(r, g, b);
    doc.rect(x, y - RECT_H + 0.5, RECT_W, RECT_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.5);
    doc.setTextColor(tr, tg, tb);
    doc.text(shift.shortName, x + RECT_W / 2, y - 0.2, { align: 'center' });

    // Ligne 1 : nom du shift
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(30);
    doc.text(shift.name, x + TEXT_X_OFFSET, y - 0.2);

    // Ligne 2 : horaire complet (jamais tronqué)
    if (shift.startTime && shift.endTime) {
      const timeStr = `${shift.startTime.replace(':', 'h')} - ${shift.endTime.replace(':', 'h')}`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.setTextColor(120);
      doc.text(timeStr, x + TEXT_X_OFFSET, y + 2.8);
    }
  });

  // ── Pied de page ──────────────────────────────────────────
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160);
  doc.text(
    `Généré le ${format(new Date(), "d MMMM yyyy 'à' HH:mm", { locale: fr })} — ${companyName}`,
    MARGIN,
    PAGE_H - 4
  );

  // ── Téléchargement ────────────────────────────────────────
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planning-${periodStart}-${periodEnd}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
