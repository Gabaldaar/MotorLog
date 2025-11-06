'use client';

import { Fuel, Loader2, Calendar, Gauge } from 'lucide-react';
import type { EstimateFuelStopOutput } from '@/ai/flows/estimate-fuel-stop';
import { formatDate } from '@/lib/utils';
import { Card } from '../ui/card';

interface EstimatedRefuelCardProps {
  estimate: EstimateFuelStopOutput | null;
  isLoading: boolean;
}

export default function EstimatedRefuelCard({ estimate, isLoading }: EstimatedRefuelCardProps) {
  
  const shortFormatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <Card className="border-dashed border-2 border-blue-500/50 bg-blue-500/10">
      <div className="px-6 py-4 text-left">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
          <div className="flex items-center gap-4">
            {isLoading ? (
              <Loader2 className="h-8 w-8 flex-shrink-0 text-blue-500/80 animate-spin" />
            ) : (
              <Fuel className="h-8 w-8 flex-shrink-0 text-blue-500/80" />
            )}

            <div className="flex-1 min-w-0">
              <p className="font-semibold">
                {isLoading ? 'Estimando próxima recarga...' : 'Próxima Recarga (Estimado)'}
              </p>
              {!isLoading && estimate && (
                <p className="text-sm text-muted-foreground">
                  Basado en tu consumo promedio.
                </p>
              )}
            </div>
          </div>
          {!isLoading && estimate && (
            <div className="text-sm sm:text-right sm:ml-auto w-full sm:w-auto">
                <div className="flex flex-row sm:flex-col justify-between items-center w-full">
                    <div className='flex items-center gap-2'>
                        <p className="font-semibold flex items-center justify-end gap-2">
                            {Math.round(estimate.estimatedOdometerAtEmpty).toLocaleString()} km
                        </p>
                         <p className="text-xs text-muted-foreground flex items-center justify-end gap-2">
                            <Gauge className="h-4 w-4" />
                            Odóm.
                        </p>
                    </div>
                     <div className='flex items-center gap-2'>
                        <p className="font-medium flex items-center justify-end gap-2">
                           ~{Math.round(estimate.estimatedDistanceToEmptyKm)} km
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center justify-end gap-2 mt-1">
                            {shortFormatDate(estimate.estimatedRefuelDate)}
                            <Calendar className="h-3 w-3" />
                        </p>
                    </div>
                </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
