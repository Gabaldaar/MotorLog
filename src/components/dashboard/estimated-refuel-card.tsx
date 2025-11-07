'use client';

import { useMemo } from 'react';
import type { Vehicle, ProcessedFuelLog } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Fuel, Gauge, Calendar, Sparkles } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { addDays, differenceInDays } from 'date-fns';

interface EstimatedRefuelCardProps {
  vehicle: Vehicle & { averageConsumptionKmPerLiter?: number };
  allFuelLogs: ProcessedFuelLog[];
}

export default function EstimatedRefuelCard({ vehicle, allFuelLogs }: EstimatedRefuelCardProps) {
  const estimatedRefuel = useMemo(() => {
    if (!allFuelLogs || allFuelLogs.length < 2) return null;

    const sortedLogsDesc = [...allFuelLogs].sort((a,b) => b.odometer - a.odometer);
    const lastLog = sortedLogsDesc[0];
    
    const avgConsumption = vehicle.averageConsumptionKmPerLiter;
    if (!lastLog || !avgConsumption || avgConsumption <= 0) return null;

    const sortedLogsByDate = [...allFuelLogs].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstLog = sortedLogsByDate[0];
    const days = differenceInDays(new Date(lastLog.date), new Date(firstLog.date));
    const totalKm = lastLog.odometer - firstLog.odometer;
    const avgKmPerDay = days > 0 ? totalKm / days : 0;
    
    if (avgKmPerDay <= 0) return null;

    const lastFillUpLog = sortedLogsDesc.find(l => l.isFillUp);
    if (!lastFillUpLog) return null;

    const odoSinceLastFill = lastLog.odometer - lastFillUpLog.odometer;
    const fuelConsumedSinceFill = odoSinceLastFill / avgConsumption;
    const currentFuel = vehicle.fuelCapacityLiters - fuelConsumedSinceFill;

    const fuelReserve = vehicle.fuelCapacityLiters * 0.15;
    if (currentFuel <= fuelReserve) return null;

    const kmToRefuelThreshold = (currentFuel - fuelReserve) * avgConsumption;
    const kmExpected = lastLog.odometer + kmToRefuelThreshold;

    const daysToNextRefuel = kmToRefuelThreshold / avgKmPerDay;
    const dateExpected = addDays(new Date(), daysToNextRefuel);

    return {
        kmExpected: Math.round(kmExpected),
        kmRemaining: Math.round(kmToRefuelThreshold),
        dateExpected: formatDate(dateExpected.toISOString()),
    }

  }, [allFuelLogs, vehicle]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
            <Sparkles className="text-primary"/> Próxima Recarga Estimada
        </CardTitle>
      </CardHeader>
      <CardContent>
        {estimatedRefuel ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-4 text-sm">
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
            <div className="pb-4 text-sm text-muted-foreground">
                No hay suficientes datos para generar una estimación. Asegúrate de tener al menos dos registros de combustible con un llenado completo entre ellos.
            </div>
        )}
        <CardDescription>
          Una predicción inteligente basada en tu consumo y hábitos de conducción.
        </CardDescription>
      </CardContent>
    </Card>
  );
}
