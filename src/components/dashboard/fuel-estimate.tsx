'use client';

import { useState } from 'react';
import { Loader2, Droplets } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ai } from '@/ai/client';
import type { EstimateFuelStopOutput } from '@/ai/flows/estimate-fuel-stop';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

interface FuelEstimateProps {
  vehicle: {
    make: string;
    model: string;
    year: number;
    fuelCapacityLiters: number;
    averageConsumptionKmPerLiter: number;
  };
}

export default function FuelEstimate({ vehicle }: FuelEstimateProps) {
  const [fuelLevel, setFuelLevel] = useState(50);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EstimateFuelStopOutput | null>(null);
  const { toast } = useToast();

  const handleEstimate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const output = await ai.estimateFuelStop({
        vehicleMake: vehicle.make,
        vehicleModel: vehicle.model,
        vehicleYear: vehicle.year,
        fuelCapacityLiters: vehicle.fuelCapacityLiters,
        averageConsumptionKmPerLiter: vehicle.averageConsumptionKmPerLiter,
        currentFuelLevelPercent: fuelLevel,
      });
      setResult(output);
    } catch (error) {
      console.error('Error estimating fuel stop:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Estimación',
        description: 'No se pudo estimar la próxima parada de combustible.',
      });
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Estimación de Combustible (AI)</CardTitle>
        <CardDescription>
          Calcula la autonomía restante y la fecha de repostaje estimada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="fuel-level" className="mb-2 block">
            Nivel de Combustible Actual: {fuelLevel}%
          </Label>
          <div className="flex items-center gap-4">
            <Droplets className="h-5 w-5 text-muted-foreground" />
            <Slider
              id="fuel-level"
              value={[fuelLevel]}
              onValueChange={(value) => setFuelLevel(value[0])}
              max={100}
              step={1}
              disabled={loading}
            />
          </div>
        </div>

        {result && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                 <h4 className="font-semibold text-center mb-4">Resultados de la Estimación</h4>
                 <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                        <p className="text-sm text-muted-foreground">Distancia Estimada</p>
                        <p className="text-xl font-bold text-primary">{Math.round(result.estimatedDistanceToEmptyKm)} km</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Fecha de Repostaje</p>
                        <p className="text-xl font-bold text-primary">{formatDate(result.estimatedRefuelDate)}</p>
                    </div>
                 </div>
            </div>
        )}

      </CardContent>
      <CardFooter>
        <Button onClick={handleEstimate} disabled={loading} className="w-full">
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : (
            'Estimar Próxima Parada'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
