'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Employee } from '@/lib/types';
import { usePlanningStore } from '@/lib/store';

/** Applique ?employee= & ?date= depuis une alerte : filtre + surbrillance + scroll. */
export function usePlanningDeepLink(activeEmployees: Employee[]) {
  const searchParams = useSearchParams();
  const employeeParam = searchParams.get('employee');
  const dateParam = searchParams.get('date');

  const setFilterMode = usePlanningStore((s) => s.setPlanningEmployeeFilterMode);
  const setSelectedEmployeeIds = usePlanningStore((s) => s.setPlanningSelectedEmployeeIds);

  const [focusCell, setFocusCell] = useState<{ employeeId: string; date: string } | null>(
    null
  );

  useEffect(() => {
    if (!employeeParam) return;
    const isActive = activeEmployees.some((e) => e.id === employeeParam);
    if (!isActive) return;

    setFilterMode('subset');
    setSelectedEmployeeIds([employeeParam]);

    if (dateParam) {
      setFocusCell({ employeeId: employeeParam, date: dateParam });
    }
  }, [
    employeeParam,
    dateParam,
    activeEmployees,
    setFilterMode,
    setSelectedEmployeeIds,
  ]);

  useEffect(() => {
    if (!focusCell) return;

    const scrollToCell = () => {
      const el = document.querySelector(
        `[data-planning-cell="${focusCell.employeeId}|${focusCell.date}"]`
      );
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        return true;
      }
      return false;
    };

    if (scrollToCell()) {
      const timer = window.setTimeout(() => setFocusCell(null), 5000);
      return () => window.clearTimeout(timer);
    }

    const retry = window.setTimeout(scrollToCell, 300);
    const clear = window.setTimeout(() => setFocusCell(null), 6000);
    return () => {
      window.clearTimeout(retry);
      window.clearTimeout(clear);
    };
  }, [focusCell, activeEmployees]);

  const isFocusedCell = useCallback(
    (employeeId: string, date: string) =>
      focusCell?.employeeId === employeeId && focusCell?.date === date,
    [focusCell]
  );

  return { isFocusedCell };
}
