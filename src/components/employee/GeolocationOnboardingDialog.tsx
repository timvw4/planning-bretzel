'use client';

import { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { requestDevicePosition } from '@/lib/geolocation';
import { markGeoOnboardingComplete } from '@/lib/employeeGeolocationOnboarding';

interface GeolocationOnboardingDialogProps {
  open: boolean;
  employeeId: string;
  onComplete: () => void;
}

/**
 * Demande la localisation une seule fois à la première ouverture du portail employé.
 * Évite la popup navigateur au moment du pointage « Je commence / Je termine ».
 */
export function GeolocationOnboardingDialog({
  open,
  employeeId,
  onComplete,
}: GeolocationOnboardingDialogProps) {
  const [requesting, setRequesting] = useState(false);

  const finish = () => {
    markGeoOnboardingComplete(employeeId);
    onComplete();
  };

  const handleAllow = async () => {
    setRequesting(true);
    try {
      await requestDevicePosition();
    } catch {
      // Refus ou erreur : on ne réaffichera plus cette fenêtre
    } finally {
      setRequesting(false);
      finish();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) finish();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center mb-2">
            <MapPin className="w-5 h-5 text-indigo-600" />
          </div>
          <DialogTitle>Autoriser la localisation</DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            Pour pointer vos heures, l&apos;application utilise votre position.
            Acceptez <strong>maintenant</strong> : vous ne serez plus interrompu au moment
            de cliquer sur « Début de travail » ou « Fin de travail ».
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={requesting}
            onClick={finish}
          >
            Pas maintenant
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto gap-2"
            disabled={requesting}
            onClick={() => void handleAllow()}
          >
            {requesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MapPin className="w-4 h-4" />
            )}
            Autoriser la localisation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
