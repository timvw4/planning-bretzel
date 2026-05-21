// ============================================================
// GÉOLOCALISATION — distance GPS et périmètre de travail
// Utilisé pour afficher la distance employé ↔ site sur les feuilles d'heures
// ============================================================

/** Rayon moyen de la Terre en mètres (formule haversine). */
const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Distance en ligne droite entre deux points GPS, en mètres.
 * Formule « haversine » — précise pour des distances courtes (quelques km).
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/** Indique si un point est à l'intérieur du cercle (centre + rayon en mètres). */
export function isInsideGeofence(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radiusM: number
): boolean {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return false;
  return haversineMeters(lat, lng, centerLat, centerLng) <= radiusM;
}
