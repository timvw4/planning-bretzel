'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { usePlanningStore } from '@/lib/store';

interface HistoryRow {
  id: number;
  action: 'update' | 'delete';
  changed_at: string;
  changed_by: string | null;
  changed_fields: string[] | null;
}

/** Colonnes techniques traduites en français, pour un journal lisible. */
const FIELD_LABELS: Record<string, string> = {
  actual_start: 'heure de début retenue',
  actual_end: 'heure de fin retenue',
  approved_start_mode: 'origine de l’heure de début',
  approved_end_mode: 'origine de l’heure de fin',
  clock_in_at: 'pointage d’arrivée',
  clock_out_at: 'pointage de départ',
  status: 'statut',
  pause_minutes: 'durée de pause',
  pause_15min: 'pause',
  had_snack: 'collation',
  ate_work_food: 'repas au travail',
  note: 'note de l’employé',
  admin_note: 'note de la direction',
  deleted_at: 'archivage',
  auto_closed: 'clôture automatique',
};

/** Champs purement techniques : inutile de les montrer. */
const HIDDEN_FIELDS = new Set(['reviewed_at', 'declared_at', 'deleted_by']);

function describeFields(fields: string[] | null): string {
  const visible = (fields ?? []).filter((f) => !HIDDEN_FIELDS.has(f));
  if (visible.length === 0) return 'validation';
  return visible.map((f) => FIELD_LABELS[f] ?? f).join(', ');
}

/**
 * Journal des corrections apportées à un pointage. Alimenté automatiquement
 * par la base de données : chaque modification y laisse une trace.
 */
export function PunchHistory({ punchId }: { punchId: string }) {
  const employees = usePlanningStore((s) => s.employees);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('time_declaration_history')
        .select('id, action, changed_at, changed_by, changed_fields')
        .eq('declaration_id', punchId)
        .order('changed_at', { ascending: false })
        .limit(20);

      if (cancelled) return;
      if (error) {
        console.error(error);
        setRows([]);
        return;
      }

      const history = (data ?? []) as HistoryRow[];
      setRows(history);

      // Les auteurs sont des comptes : on remonte au nom de l'employé lié.
      const authorIds = [
        ...new Set(history.map((r) => r.changed_by).filter((v): v is string => Boolean(v))),
      ];
      if (authorIds.length === 0) return;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, employee_id, role')
        .in('id', authorIds);

      if (cancelled) return;
      const names: Record<string, string> = {};
      for (const profile of profiles ?? []) {
        const emp = employees.find((e) => e.id === profile.employee_id);
        names[profile.id as string] = emp
          ? `${emp.firstName} ${emp.lastName}`.trim()
          : profile.role === 'admin'
            ? 'Direction'
            : 'Compte inconnu';
      }
      setAuthorNames(names);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [punchId, employees]);

  if (rows === null) {
    return (
      <p className="text-[11px] text-slate-400">Chargement de l’historique…</p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-slate-400">
        Aucune modification depuis l’enregistrement du pointage.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <History className="h-3 w-3" />
        Historique des modifications
      </p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="text-[11px] leading-snug text-slate-600">
            <span className="font-medium text-slate-700">
              {format(parseISO(row.changed_at), 'd MMM yyyy à HH:mm', { locale: fr })}
            </span>
            {' — '}
            {row.action === 'delete' ? 'pointage archivé' : describeFields(row.changed_fields)}
            {row.changed_by && authorNames[row.changed_by]
              ? ` (${authorNames[row.changed_by]})`
              : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
