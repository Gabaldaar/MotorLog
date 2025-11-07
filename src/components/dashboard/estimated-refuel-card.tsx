'use client';

import { useMemo } from 'react';
import type { Vehicle, ProcessedFuelLog } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Fuel, Gauge, Calendar, Sparkles } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { addDays, differenceInDays } from 'date-fns';
import { Skeleton } from '../ui/skeleton';

interface EstimatedRefuelCardProps {
  vehicle: Vehicle & { averageConsumptionKmPerLiter?: number };
  allFuelLogs: ProcessedFuelLog[];
}

export default function EstimatedRefuelCard({ vehicle, allFuelLogs }: EstimatedRefuelCardProps) {
  const estimatedRefuel = useMemo(() => {
    const lastLog = allFuelLogs?.[0];
    if (!lastLog || !vehicle.averageConsumptionKmPerLiter || vehicle.averageConsumptionKmPerLiter <= 0 || allFuelLogs.length < 2) {
      return { status: 'no-data' as const };
    }
    
    // Estimate current fuel level
    let fuelSinceLastFillUp = 0;
    let isPartialFillChain = false;
    for (const log of allFuelLogs) {
        if (log.isFillUp) break; 
        fuelSinceLastFillUp += log.liters;
        isPartialFillChain = true;
    }
    
    const lastFillUpLog = allFuelLogs.find(l => l.isFillUp);

    const currentFuel = isPartialFillChain 
      ? fuelSinceLastFillUp
      : (lastFillUpLog ? vehicle.fuelCapacityLiters - ((lastLog.odometer - lastFillUpLog.odometer) / vehicle.averageConsumptionKmPerLiter) : 0);

    if (currentFuel <= 0) return { status: 'no-data' as const };

    // Avg km per day
    const sortedLogs = [...allFuelLogs].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstLog = sortedLogs[0];
    const days = differenceInDays(new Date(lastLog.date), new Date(firstLog.date));
    const totalKm = lastLog.odometer - firstLog.odometer;
    const avgKmPerDay = days > 0 ? totalKm / days : 0;
    
    if (avgKmPerDay <= 0) return { status: 'no-data' as const };

    // Estimated next refuel (at 20% tank)
    const kmToNextRefuel = vehicle.averageConsumptionKmPerLiter * (vehicle.fuelCapacityLiters * 0.8);
    
    const lastRefuelOdo = lastFillUpLog?.odometer || lastLog.odometer;
    const kmExpected = lastRefuelOdo + kmToNextRefuel;
    const kmRemaining = kmExpected - lastLog.odometer;

    const daysToNextRefuel = kmRemaining / avgKmPerDay;
    const dateExpected = addDays(new Date(), daysToNextRefuel);


    return {
        status: 'ok' as const,
        kmExpected: Math.round(kmExpected),
        kmRemaining: Math.round(kmRemaining),
        dateExpected: formatDate(dateExpected.toISOString()),
    }

  }, [allFuelLogs, vehicle]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2"><Sparkles className="text-primary"/> Próxima Recarga Estimada</CardTitle>
        <CardDescription>
          Una predicción inteligente basada en tu consumo y hábitos de conducción.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {estimatedRefuel.status === 'ok' ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2 text-sm">
             <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-muted-foreground" />
                <div>
                    <p className="font-semibold text-lg">{estimatedRefuel.kmExpected.toLocaleString()} km</p>
                    <p className="text-xs text-muted-foreground">Odómetro Estimado</p>
                </div>
            </div>
             <div className="flex items-center gap-2">
                <Fuel className="h-5 w-5 text-muted-foreground" />
                 <div>
                    <p className="font-semibold text-lg">{estimatedRefuel.kmRemaining.toLocaleString()} km</p>
                    <p className="text-xs text-muted-foreground">Faltan Aprox.</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                 <div>
                    <p className="font-semibold text-lg">{estimatedRefuel.dateExpected}</p>
                    <p className="text-xs text-muted-foreground">Fecha Estimada</p>
                </div>
            </div>
          </div>
        ) : (
            <div className="text-sm text-muted-foreground">
                No hay suficientes datos para generar una estimación. Asegúrate de tener al menos dos registros de combustible.
            </div>
        )}
      </CardContent>
    </Card>
  );
}
