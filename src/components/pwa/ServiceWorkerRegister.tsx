'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker sur toutes les pages, y compris la
 * connexion. Android n'affiche « Ajouter à l'écran d'accueil » que si
 * un service worker est déjà actif ; le n'enregistrer que sur l'espace
 * employé faisait rater l'installation depuis l'écran de login.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}
