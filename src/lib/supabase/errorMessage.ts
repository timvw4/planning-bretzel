/**
 * Texte lisible pour une erreur renvoyée par Supabase / PostgREST.
 * Les objets PostgrestError ne se sérialisent pas bien en JSON (souvent "{}"),
 * d'où cette extraction explicite.
 */
export function supabaseErrorMessage(error: unknown): string {
  if (error == null) return 'Erreur inconnue';
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const msg = o.message;
    const details = o.details;
    const hint = o.hint;
    const code = o.code;
    const parts = [msg, details, hint]
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (parts.length > 0) return parts.join(' — ');
    if (typeof code === 'string' && code.length > 0) return `Erreur base de données (code ${code})`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Erreur inconnue';
  }
}
