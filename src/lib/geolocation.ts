/**
 * Lecture du GPS navigateur pour les déclarations d'heures.
 * Nécessite une page servie en HTTPS (ou localhost) pour getCurrentPosition.
 */

export type DevicePosition = {
  lat: number;
  lng: number;
  /** Incertitude du signal en mètres si le navigateur la fournit */
  accuracyM: number | null;
};

/**
 * Demande la position actuelle (une seule mesure, haute précision demandée).
 * Rejette si refus utilisateur, timeout, ou API indisponible.
 */
export function requestDevicePosition(): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error("Ce navigateur ne supporte pas la géolocalisation."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM:
            pos.coords.accuracy != null && Number.isFinite(pos.coords.accuracy)
              ? pos.coords.accuracy
              : null,
        });
      },
      (err) => {
        reject(err instanceof Error ? err : new Error(String(err?.message ?? err)));
      },
      {
        enableHighAccuracy: true,
        timeout: 25_000,
        maximumAge: 0,
      }
    );
  });
}
