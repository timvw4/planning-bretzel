'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirection automatique vers le planning mensuel
export default function PlanningPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/planning/monthly');
  }, [router]);
  return null;
}
