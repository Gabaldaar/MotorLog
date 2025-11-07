'use client';

import { useState, useMemo } from 'react';
import type { Vehicle, ProcessedFuelLog } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Fuel, Gauge, Loader2, Sparkles, Wand } from 'lucide-react';
import { estimateFuelStop } from '@/ai/flows/estimate-fuel-stop';
import { Skeleton } from '../ui/skeleton';

interface EstimatedRefuelCardProps {
  vehicle: Vehicle & { averageConsumptionKmPerLiter?: number };
  lastLog?: ProcessedFuelLog;
}

export default function EstimatedRefuelCard({ vehicle, lastLog }: EstimatedRefuelCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof estimateFuelStop>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const canCalculate = useMemo(() => {
    return vehicle && lastLog && vehicle.averageConsumptionKmPerLiter && vehicle.averageConsumptionKmPerLiter > 0;
  }, [vehicle, lastLog]);


  const getEstimation = async () => {
    if (!canCalculate || !vehicle.averageConsumptionKmPerLiter || !lastLog) {
      setError("No hay suficientes datos para generar una estimación. Asegúrate de tener al menos un registro de combustible y un consumo promedio definido para el vehículo.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const estimation = await estimateFuelStop({
        vehicleMake: vehicle.make,
        vehicleModel: vehicle.model,
        vehicleYear: vehicle.year,
        avgConsumption: vehicle.averageConsumptionKmPerLiter,
        fuelCapacity: vehicle.fuelCapacityLiters,
        lastOdometer: lastLog.odometer,
        lastFuelDate: lastLog.date,
        lastLiters: lastLog.liters,
        isLastFillUp: lastLog.isFillUp,
      });
      setResult(estimation);
    } catch (e: any) {
      console.error("Error getting fuel stop estimation:", e);
      setError("No se pudo generar la recomendación. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };
  
  const getBadgeVariant = (recommendation?: string) => {
    if (!recommendation) return "secondary";
    if (recommendation.includes("Urgente")) return "destructive";
    if (recommendation.includes("Recomendada")) return "default";
    return "secondary";
  }
  
  if (!canCalculate) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2"><Sparkles className="text-primary"/> Asistente de Recarga</CardTitle>
        <CardDescription>
          Obtén una recomendación inteligente sobre si necesitas recargar combustible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
            <div className="space-y-4">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-4 pt-2">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                </div>
            </div>
        ): result ? (
          <div className="space-y-3">
             <Badge variant={getBadgeVariant(result.recommendation)} className="text-base">
                {result.recommendation}
             </Badge>
            <p className="text-sm text-muted-foreground">{result.justification}</p>
             <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-sm">
                <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{result.estimatedRange.toLocaleString()} km</p>
                        <p className="text-xs text-muted-foreground">Autonomía Est.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Fuel className="h-4 w-4 text-muted-foreground" />
                     <div>
                        <p className="font-medium">{result.estimatedFuelLevel.toLocaleString()} L</p>
                        <p className="text-xs text-muted-foreground">Combustible Est.</p>
                    </div>
                </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4">
            {error && (
                <div className="text-destructive text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                </div>
            )}
            <Button onClick={getEstimation} disabled={isLoading}>
              <Wand className="mr-2 h-4 w-4" />
              Generar Recomendación
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
