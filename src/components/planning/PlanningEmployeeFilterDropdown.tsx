'use client';

import { Filter, ChevronDown } from 'lucide-react';
import type { Employee } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePlanningEmployeeFilter } from '@/hooks/usePlanningEmployeeFilter';

interface PlanningEmployeeFilterDropdownProps {
  activeEmployees: Employee[];
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
  /** Bouton compact (planning réel toolbar) ou standard (header). */
  size?: 'sm' | 'default';
}

export function PlanningEmployeeFilterDropdown({
  activeEmployees,
  disabled,
  align = 'end',
  size = 'default',
}: PlanningEmployeeFilterDropdownProps) {
  const {
    employeesForFilterMenu,
    areAllEmployeesSelected,
    isEmployeeRowChecked,
    handleToggleAllEmployees,
    handleToggleOneEmployee,
    unifiedFilterTitle,
    hasActiveFilters,
  } = usePlanningEmployeeFilter(activeEmployees);

  const isCompact = size === 'sm';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={
            isCompact
              ? 'h-9 min-w-[7rem] justify-between gap-2 font-normal px-3'
              : 'h-9 min-w-[7rem] justify-between gap-2 font-normal px-3'
          }
          title={unifiedFilterTitle || undefined}
          disabled={disabled ?? activeEmployees.length === 0}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Filter className={`shrink-0 text-slate-500 ${isCompact ? 'h-4 w-4' : 'h-4 w-4'}`} />
            <span className="text-sm text-slate-700">Filtre</span>
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" aria-hidden />
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-80 max-h-[min(24rem,70vh)] overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-semibold text-slate-500">
          Employés affichés
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={areAllEmployeesSelected}
          onCheckedChange={handleToggleAllEmployees}
          onSelect={(e) => e.preventDefault()}
        >
          Tous les employés ({activeEmployees.length})
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {employeesForFilterMenu.map((e) => (
          <DropdownMenuCheckboxItem
            key={e.id}
            checked={isEmployeeRowChecked(e.id)}
            onCheckedChange={(c) => handleToggleOneEmployee(e.id, c === true)}
            onSelect={(ev) => ev.preventDefault()}
          >
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/5"
                style={{ backgroundColor: e.color }}
              />
              <span className="truncate">
                {e.firstName}
                {e.lastName ? ` ${e.lastName}` : ''}
              </span>
              <span className="text-[10px] text-slate-400 ml-auto shrink-0 tabular-nums">
                {getInitials(e.firstName, e.lastName)}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
