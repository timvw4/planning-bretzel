'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirection automatique vers le planning hebdomadaire
export default function PlanningPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/planning/weekly');
  }, [router]);
  return null;
}
