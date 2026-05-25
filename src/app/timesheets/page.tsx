import { redirect } from 'next/navigation';

/** Ancienne route — redirige vers Pointages. */
export default function TimesheetsRedirectPage() {
  redirect('/pointages');
}
