'use client';

import { useEffect, useMemo } from 'react';
import type { Employee } from '@/lib/types';
import { usePlanningStore } from '@/lib/store';

export type PlanningEmployeeFilterMode = 'all' | 'subset';

/** Filtre employés partagé entre planning prévu / réel, mensuel / hebdomadaire. */
export function usePlanningEmployeeFilter(activeEmployees: Employee[]) {
  const filterMode = usePlanningStore((s) => s.planningEmployeeFilterMode);
  const selectedEmployeeIds = usePlanningStore((s) => s.planningSelectedEmployeeIds);
  const setFilterMode = usePlanningStore((s) => s.setPlanningEmployeeFilterMode);
  const setSelectedEmployeeIds = usePlanningStore((s) => s.setPlanningSelectedEmployeeIds);

  useEffect(() => {
    if (filterMode !== 'subset') return;
    const valid = new Set(activeEmployees.map((e) => e.id));
    const pruned = selectedEmployeeIds.filter((id) => valid.has(id));
    if (
      pruned.length === activeEmployees.length &&
      activeEmployees.length > 0 &&
      activeEmployees.every((e) => pruned.includes(e.id))
    ) {
      queueMicrotask(() => {
        setFilterMode('all');
        setSelectedEmployeeIds([]);
      });
      return;
    }
    if (pruned.length !== selectedEmployeeIds.length) {
      setSelectedEmployeeIds(pruned);
    }
  }, [activeEmployees, filterMode, selectedEmployeeIds, setFilterMode, setSelectedEmployeeIds]);

  const employeesForFilterMenu = useMemo(
    () =>
      [...activeEmployees].sort((a, b) =>
        a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' })
      ),
    [activeEmployees]
  );

  const displayedEmployees = useMemo(() => {
    if (filterMode === 'all') return activeEmployees;
    return activeEmployees.filter((e) => selectedEmployeeIds.includes(e.id));
  }, [filterMode, selectedEmployeeIds, activeEmployees]);

  const filterSummaryTitle = useMemo(() => {
    const list =
      filterMode === 'all'
        ? activeEmployees
        : activeEmployees.filter((e) => selectedEmployeeIds.includes(e.id));
    return list
      .map((e) => `${e.firstName}${e.lastName ? ` ${e.lastName}` : ''}`.trim())
      .join(', ');
  }, [filterMode, selectedEmployeeIds, activeEmployees]);

  const filterSummaryLabel = useMemo(() => {
    const n = activeEmployees.length;
    if (n === 0) return 'Aucun employé actif';
    if (filterMode === 'all') return `Tous les employés (${n})`;
    const k = selectedEmployeeIds.length;
    if (k === 0) return 'Aucun employé';
    if (k === 1) {
      const e = activeEmployees.find((x) => x.id === selectedEmployeeIds[0]);
      return e
        ? `${e.firstName}${e.lastName ? ` ${e.lastName}` : ''}`.trim()
        : '1 employé';
    }
    return `${k} employés`;
  }, [filterMode, selectedEmployeeIds, activeEmployees]);

  const unifiedFilterTitle = filterSummaryTitle || filterSummaryLabel;
  const hasActiveFilters = filterMode === 'subset';

  const areAllEmployeesSelected =
    filterMode === 'all' ||
    (activeEmployees.length > 0 &&
      activeEmployees.every((e) => selectedEmployeeIds.includes(e.id)));

  const isEmployeeRowChecked = (id: string) =>
    areAllEmployeesSelected || selectedEmployeeIds.includes(id);

  const handleToggleAllEmployees = () => {
    if (areAllEmployeesSelected) {
      setFilterMode('subset');
      setSelectedEmployeeIds([]);
    } else {
      setFilterMode('all');
      setSelectedEmployeeIds([]);
    }
  };

  const handleToggleOneEmployee = (id: string, checked: boolean) => {
    if (areAllEmployeesSelected) {
      if (!checked) {
        setFilterMode('subset');
        setSelectedEmployeeIds(activeEmployees.map((e) => e.id).filter((x) => x !== id));
      }
      return;
    }
    if (checked) {
      const next = Array.from(new Set([...selectedEmployeeIds, id]));
      if (next.length === activeEmployees.length) {
        setFilterMode('all');
        setSelectedEmployeeIds([]);
      } else {
        setSelectedEmployeeIds(next);
      }
    } else {
      setFilterMode('subset');
      setSelectedEmployeeIds(selectedEmployeeIds.filter((x) => x !== id));
    }
  };

  return {
    displayedEmployees,
    employeesForFilterMenu,
    areAllEmployeesSelected,
    isEmployeeRowChecked,
    handleToggleAllEmployees,
    handleToggleOneEmployee,
    filterSummaryLabel,
    unifiedFilterTitle,
    hasActiveFilters,
  };
}
