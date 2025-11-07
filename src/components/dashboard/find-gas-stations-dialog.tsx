
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, MapPin, Search } from 'lucide-react';
import { ai } from '@/ai/client';
import type { GasStationResult } from '@/ai/flows/find-nearby-gas-stations';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface FindGasStationsDialogProps {
  onStationSelect: (name: string) => void;
}

type GeolocationState = 'idle' | 'loading' | 'success' | 'error';
type SearchState = 'idle' | 'searching' | 'success' | 'error';

export default function FindGasStationsDialog({ onStationSelect }: FindGasStationsDialogProps) {
  const [open, setOpen] = useState(false);
  const [locationState, setLocationState] = useState<GeolocationState>('idle');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [stations, setStations] = useState<GasStationResult['stations']>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFindStations = () => {
    if (!('geolocation' in navigator)) {
      setError('La geolocalización no está disponible en tu navegador.');
      setLocationState('error');
      return;
    }

    setLocationState('loading');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setLocationState('success');
        setSearchState('searching');
        try {
          const result = await ai.findNearbyGasStations({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setStations(result.stations);
          setSearchState('success');
        } catch (e) {
          console.error(e);
          setError('No se pudieron encontrar gasolineras. Inténtalo de nuevo.');
          setSearchState('error');
        }
      },
      (error) => {
        let message = 'No se pudo obtener tu ubicación. ';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message += 'Por favor, concede permiso para acceder a tu ubicación.';
            break;
          case error.POSITION_UNAVAILABLE:
            message += 'La información de ubicación no está disponible.';
            break;
          case error.TIMEOUT:
            message += 'La solicitud de ubicación ha caducado.';
            break;
          default:
            message += 'Ocurrió un error desconocido.';
            break;
        }
        setError(message);
        setLocationState('error');
        setSearchState('idle');
      }
    );
  };

  const handleSelect = (name: string) => {
    onStationSelect(name);
    setOpen(false);
    toast({
        title: 'Gasolinera Seleccionada',
        description: `${name} ha sido añadida al campo de gasolinera.`,
    })
  };

  const resetState = () => {
    setLocationState('idle');
    setSearchState('idle');
    setStations([]);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
            resetState();
        }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <MapPin className="h-4 w-4" />
          <span className="sr-only">Buscar gasolineras cercanas</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buscar Gasolineras Cercanas</DialogTitle>
          <DialogDescription>
            Encuentra gasolineras cerca de tu ubicación actual.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 min-h-[200px]">
          {locationState === 'idle' && searchState === 'idle' && (
            <div className="flex flex-col items-center justify-center text-center h-full">
              <p className="text-muted-foreground mb-4">
                Haz clic en el botón para buscar gasolineras cerca de ti.
              </p>
              <Button onClick={handleFindStations}>
                <Search className="mr-2 h-4 w-4" /> Buscar Gasolineras
              </Button>
            </div>
          )}

          {(locationState === 'loading' || searchState === 'searching') && (
            <div className="flex flex-col items-center justify-center text-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="font-semibold">
                {locationState === 'loading' ? 'Obteniendo tu ubicación...' : 'Buscando gasolineras...'}
              </p>
              <p className="text-sm text-muted-foreground">Por favor, espera un momento.</p>
            </div>
          )}

          {(locationState === 'error' || searchState === 'error') && error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {searchState === 'success' && (
            <div className="space-y-2">
                <p className="text-sm font-medium">Resultados encontrados:</p>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                    {stations.length > 0 ? stations.map((station) => (
                        <div
                            key={station.name}
                            className="flex justify-between items-center p-3 rounded-md border hover:bg-accent cursor-pointer"
                            onClick={() => handleSelect(station.name)}
                        >
                            <div>
                                <p className="font-semibold">{station.name}</p>
                                <p className="text-sm text-muted-foreground">{station.address}</p>
                            </div>
                            <span className="text-sm font-medium text-primary">{station.distance}</span>
                        </div>
                    )) : <p className="text-sm text-muted-foreground text-center py-4">No se encontraron resultados.</p>}
                </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
