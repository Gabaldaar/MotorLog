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
import { Loader2, MapPin, Search, Navigation, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { useToast } from '@/hooks/use-toast';
import { findNearbyGasStations, type GasStationOutput } from '@/ai/flows/find-nearby-gas-stations';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface FindNearbyGasStationsDialogProps {
  children: React.ReactNode;
  onStationSelect: (stationName: string) => void;
}

export default function FindNearbyGasStationsDialog({ children, onStationSelect }: FindNearbyGasStationsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stations, setStations] = useState<GasStationOutput[]>([]);
  const { toast } = useToast();
  const [radius, setRadius] = useState('5000'); // Default radius is 5km

  const handleSearch = () => {
    setIsLoading(true);
    setError(null);
    setStations([]);
    
    if (!navigator.geolocation) {
      setError("La geolocalización no es soportada por este navegador.");
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const results = await findNearbyGasStations({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            radius: parseInt(radius, 10),
          });

          if (results.length === 0) {
            setError('No se encontraron gasolineras en este radio. Intenta ampliar la búsqueda.');
          }
          setStations(results);

        } catch (err: any) {
          console.error(err);
          setError(err.message || "Ocurrió un error al buscar gasolineras.");
          toast({
            variant: "destructive",
            title: "Error de Búsqueda",
            description: err.message || "No se pudo conectar con el servicio de mapas.",
          });
        } finally {
          setIsLoading(false);
        }
      },
      (geoError) => {
        console.error("Geolocation error:", geoError);
        let message = "No se pudo obtener tu ubicación. ";
        switch(geoError.code) {
          case geoError.PERMISSION_DENIED:
            message += "Debes permitir el acceso a tu ubicación.";
            break;
          case geoError.POSITION_UNAVAILABLE:
            message += "La información de ubicación no está disponible.";
            break;
          case geoError.TIMEOUT:
            message += "La solicitud de ubicación expiró.";
            break;
          default:
            message += "Ocurrió un error desconocido.";
            break;
        }
        setError(message);
        setIsLoading(false);
      }
    );
  };
  
  const handleSelectStation = (stationName: string) => {
    onStationSelect(stationName);
    setOpen(false);
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">Buscar Gasolineras Cercanas</DialogTitle>
          <DialogDescription>
            Encuentra gasolineras cerca de tu ubicación actual.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
                <ToggleGroup type="single" value={radius} onValueChange={(value) => value && setRadius(value)} className="w-full sm:w-auto">
                    <ToggleGroupItem value="5000">5 km</ToggleGroupItem>
                    <ToggleGroupItem value="10000">10 km</ToggleGroupItem>
                    <ToggleGroupItem value="25000">25 km</ToggleGroupItem>
                </ToggleGroup>
                <Button onClick={handleSearch} disabled={isLoading} className="w-full sm:w-auto flex-1">
                    {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                    <Search className="mr-2 h-4 w-4" />
                    )}
                    Buscar
                </Button>
            </div>


          {error && (
            <div className="text-destructive text-sm flex items-start text-center gap-2 p-3 bg-destructive/10 rounded-md">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
            {stations.map((station, index) => (
              <Card key={index} className="overflow-hidden">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">{station.name}</CardTitle>
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <MapPin className="h-3 w-3"/>{station.address}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex justify-between items-center">
                    <div className="font-semibold">{station.distance}</div>
                    <div className="flex gap-2">
                        <a href={station.mapsUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm"><Navigation className="h-4 w-4 mr-1"/> Ver en mapa</Button>
                        </a>
                        <Button size="sm" onClick={() => handleSelectStation(station.name)}>
                           Seleccionar
                        </Button>
                    </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
