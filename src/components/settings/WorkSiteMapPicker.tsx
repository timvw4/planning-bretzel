'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Circle,
  Marker,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation } from 'lucide-react';
import type { WorkSiteGeofence } from '@/lib/types';
import { requestDevicePosition } from '@/lib/geolocation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PARIS: [number, number] = [48.8566, 2.3522];

function fixLeafletDefaultIcon() {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

function MapClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface WorkSiteMapPickerProps {
  /** null = périmètre désactivé (pas de contrôle GPS obligatoire côté employé). */
  value: WorkSiteGeofence | null;
  onChange: (next: WorkSiteGeofence | null) => void;
}

/**
 * Carte : choisir le centre du lieu de travail et le rayon (m).
 * Utilisé dans Paramètres admin.
 */
export function WorkSiteMapPicker({ value, onChange }: WorkSiteMapPickerProps) {
  const [loadingGeo, setLoadingGeo] = useState(false);

  useEffect(() => {
    fixLeafletDefaultIcon();
  }, []);

  const center: [number, number] = useMemo(() => {
    if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
      return [value.lat, value.lng];
    }
    return PARIS;
  }, [value]);

  const radiusM = value?.radiusM && Number.isFinite(value.radiusM) && value.radiusM > 0 ? value.radiusM : 150;

  const setCenter = useCallback(
    (lat: number, lng: number) => {
      if (!value) return;
      onChange({ ...value, lat, lng });
    },
    [value, onChange]
  );

  const setRadius = useCallback(
    (raw: string) => {
      if (!value) return;
      const n = Number.parseFloat(raw.replace(',', '.'));
      if (!Number.isFinite(n) || n < 10) return;
      const capped = Math.min(10_000, Math.max(10, n));
      onChange({ ...value, radiusM: capped });
    },
    [value, onChange]
  );

  const enable = useCallback(() => {
    onChange({ lat: PARIS[0], lng: PARIS[1], radiusM: 150 });
  }, [onChange]);

  const disable = useCallback(() => {
    onChange(null);
  }, [onChange]);

  const useMyLocation = async () => {
    setLoadingGeo(true);
    try {
      const p = await requestDevicePosition();
      if (value) {
        onChange({ ...value, lat: p.lat, lng: p.lng });
      } else {
        onChange({ lat: p.lat, lng: p.lng, radiusM: 150 });
      }
    } catch {
      // toast could be here; éviter dépendance — parent peut documenter HTTPS
      window.alert(
        'Impossible d’obtenir votre position (autorisation refusée, GPS éteint, ou pas en HTTPS).'
      );
    } finally {
      setLoadingGeo(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={value ? disable : enable}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${
            value
              ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          }`}
        >
          {value ? 'Désactiver le périmètre' : 'Activer le périmètre'}
        </button>
        {value && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8" onClick={useMyLocation} disabled={loadingGeo}>
            <Navigation className="w-3.5 h-3.5" />
            {loadingGeo ? 'Position…' : 'Centrer sur ma position'}
          </Button>
        )}
      </div>

      {!value ? (
        <p className="text-xs text-slate-500 leading-relaxed">
          <MapPin className="inline w-3.5 h-3.5 -mt-0.5 text-slate-400" /> Aucun périmètre : les employés peuvent enregistrer
          leurs heures sans GPS (la position restera vide si le navigateur refuse la localisation).
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 leading-relaxed">
            Cliquez sur la carte pour placer le centre du lieu de travail. Cercle = zone acceptée pour la déclaration
            d&apos;heures (l&apos;employé doit être à l&apos;intérieur si la position est obtenue).
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="radiusM">Rayon (mètres)</Label>
            <Input
              id="radiusM"
              type="number"
              min={10}
              max={10000}
              step={10}
              value={Math.round(radiusM)}
              onChange={(e) => setRadius(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">Entre 10 m et 10 km. Augmentez si la validation échoue trop souvent.</p>
          </div>

          <div className="h-[220px] rounded-xl overflow-hidden border border-slate-200 z-0 relative">
            <MapContainer
              center={center}
              zoom={15}
              className="h-full w-full"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler onPick={setCenter} />
              <Marker
                position={center}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const m = e.target;
                    const ll = m.getLatLng();
                    setCenter(ll.lat, ll.lng);
                  },
                }}
              />
              <Circle
                center={center}
                radius={radiusM}
                pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.12 }}
              />
            </MapContainer>
          </div>
          <p className="text-[11px] font-mono text-slate-500">
            Centre : {center[0].toFixed(5)}, {center[1].toFixed(5)} — rayon {Math.round(radiusM)} m
          </p>
        </>
      )}
    </div>
  );
}
