'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { defaultBreakMinutes } from '@/lib/swissBreaks';

/** Options repas / pause déclarées à la fin de service pour une cellule du planning. */
export interface CellDeclarationFlags {
  pause_15min: boolean;
  /** Durée de pause déclarée, en minutes. */
  pause_minutes: number;
  had_snack: boolean;
  ate_work_food: boolean;
}

function declarationKey(employeeId: string, date: string): string {
  return `${employeeId}:${date}`;
}

/** Charge les déclarations terminées (clock out) sur une période, indexées par employé + date. */
export function usePeriodDeclarations(rangeStart: string, rangeEnd: string) {
  const [lookup, setLookup] = useState<Map<string, CellDeclarationFlags>>(new Map());
  const [reloadSeq, setReloadSeq] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('time_declarations')
        .select(
          'employee_id, date, pause_15min, pause_minutes, had_snack, ate_work_food, clock_out_at'
        )
        .gte('date', rangeStart)
        .lte('date', rangeEnd)
        .is('deleted_at', null)
        .not('clock_out_at', 'is', null);

      if (cancelled) return;

      if (error) {
        console.error(error);
        setLookup(new Map());
        return;
      }

      const map = new Map<string, CellDeclarationFlags>();
      for (const row of data ?? []) {
        map.set(declarationKey(row.employee_id, row.date), {
          pause_15min: row.pause_15min ?? true,
          pause_minutes: defaultBreakMinutes(row.pause_minutes, row.pause_15min),
          had_snack: row.had_snack ?? false,
          ate_work_food: row.ate_work_food ?? false,
        });
      }
      setLookup(map);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd, reloadSeq]);

  const reload = useCallback(() => setReloadSeq((n) => n + 1), []);

  const getDeclarations = useCallback(
    (employeeId: string, date: string): CellDeclarationFlags | undefined =>
      lookup.get(declarationKey(employeeId, date)),
    [lookup]
  );

  return { getDeclarations, reload };
}
