
'use client';

import Image from 'next/image';
import type { Vehicle, FuelLog, ProcessedFuelLog } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import AddFuelLogDialog from './add-fuel-log-dialog';
import { useEffect, useState } from 'react';
import type { EstimateFuelStopOutput } from '@/ai/flows/estimate-fuel-stop';
import { useToast } from '@/hooks/use-toast';
import { ai } from '@/ai/client';
import { formatDate } from '@/lib/utils';
import { Loader2, Wrench } from 'lucide-react';
import AddServiceReminderDialog from './add-service-reminder-dialog';
import { Button } from '../ui/button';

interface WelcomeBannerProps {
  vehicle: Vehicle & { averageConsumptionKmPerLiter?: number };
  lastLog?: ProcessedFuelLog;
}

export default function WelcomeBanner({ vehicle, lastLog }: WelcomeBannerProps) {
  const [estimate, setEstimate] = useState<EstimateFuelStopOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const getEstimate = async () => {
      if (!vehicle || !vehicle.averageConsumptionKmPerLiter || !lastLog) return;

      setIsLoading(true);
      try {
        // Assume 100% fuel after a fill-up, otherwise make a rough estimate.
        // A more complex calculation could track fuel used since last log.
        const currentFuelLevelPercent = lastLog?.isFillUp ? 100 : 80;

        const output = await ai.estimateFuelStop({
          vehicleMake: vehicle.make,
          vehicleModel: vehicle.model,
          vehicleYear: vehicle.year,
          fuelCapacityLiters: vehicle.fuelCapacityLiters,
          averageConsumptionKmPerLiter: vehicle.averageConsumptionKmPerLiter,
          currentFuelLevelPercent: currentFuelLevelPercent,
          currentOdometer: lastLog.odometer,
        });
        setEstimate(output);
      } catch (error) {
        console.error('Error getting fuel estimate:', error);
        toast({
          variant: 'destructive',
          title: 'Error de Estimación',
          description: 'No se pudo estimar la próxima parada de recarga.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    getEstimate();
  }, [vehicle, lastLog, toast]);

  return (
    <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-6">
                <CardHeader className="p-0">
                    <CardTitle className="font-headline text-3xl">
                        Bienvenido a MotorLog
                    </CardTitle>
                    <CardDescription className="text-base">
                        Gestionando tu {vehicle.make} {vehicle.model} ({vehicle.year})
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0 pt-6">
                    <p className="text-muted-foreground mb-4">
                        Aquí tienes un resumen del rendimiento y los próximos mantenimientos de tu vehículo. Añade una nueva recarga para mantener tus datos al día.
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                      {vehicle && <AddFuelLogDialog vehicleId={vehicle.id} lastLog={lastLog} vehicle={vehicle} />}
                      {vehicle && (
                        <AddServiceReminderDialog vehicleId={vehicle.id} lastOdometer={lastLog?.odometer}>
                          <Button variant="secondary">
                            <Wrench className="mr-2 h-4 w-4" />
                            Añadir Recordatorio
                          </Button>
                        </AddServiceReminderDialog>
                      )}
                      {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
                      {estimate && !isLoading && (
                        <div className="text-sm text-muted-foreground">
                            <span>Autonomía est: <b>{Math.round(estimate.estimatedDistanceToEmptyKm)} km</b></span>
                            <span className="mx-2">|</span>
                            <span>Odóm. est: <b>{Math.round(estimate.estimatedOdometerAtEmpty).toLocaleString()} km</b></span>
                             <span className="mx-2">|</span>
                            <span>Próxima recarga: <b>{formatDate(estimate.estimatedRefuelDate)}</b></span>
                        </div>
                      )}
                   </div>
                </CardContent>
            </div>
             {vehicle.imageUrl && (
                <div className="relative md:w-1/3 min-h-[200px] md:min-h-0 bg-black/5">
                    <Image
                        src={vehicle.imageUrl}
                        alt={`${vehicle.make} ${vehicle.model}`}
                        fill
                        className="object-contain"
                        data-ai-hint={vehicle.imageHint}
                    />
                </div>
            )}
        </div>
    </Card>
  );
}
