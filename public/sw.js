// Service Worker — Bretzel Planning PWA
// Version incrémentée à chaque changement de stratégie de cache :
// un téléphone déjà installé récupère ainsi le nouveau fichier.
const CACHE_NAME = 'bretzel-planning-v5';

// Uniquement des fichiers statiques. On n'y met PAS de pages HTML :
// cache.addAll échoue tout entier si une seule URL redirige (ex. /employee
// vers /login quand on n'est pas encore connecté), et le service worker
// n'est alors jamais installé — Android refuse d'ajouter l'app.
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/logo-sidebar.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Appels à la base : jamais interceptés.
  if (url.hostname.endsWith('supabase.co')) return;

  // Autre site (polices, cartes…) : on laisse le navigateur gérer.
  if (url.origin !== self.location.origin) return;

  const accept = event.request.headers.get('accept') || '';
  const isPage =
    event.request.mode === 'navigate' || accept.includes('text/html');

  // Pages HTML : toujours le réseau. Mettre une page en cache collait
  // d'anciennes versions (ancienne adresse de base, ancien JavaScript)
  // sur le téléphone, parfois pendant des jours.
  if (isPage) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
