'use client';

import Image from 'next/image';
import type { Vehicle, ProcessedFuelLog } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import AddFuelLogDialog from './add-fuel-log-dialog';
import { Wrench, Plus, Search, Fuel, Gauge, Calendar } from 'lucide-react';
import AddServiceReminderDialog from './add-service-reminder-dialog';
import { Button } from '../ui/button';
import FindNearbyGasStationsDialog from '../ai/find-nearby-gas-stations-dialog';
import { useMemo } from 'react';
import { addDays, differenceInDays } from 'date-fns';
import { formatDate } from '@/lib/utils';

interface WelcomeBannerProps {
  vehicle: Vehicle & { averageConsumptionKmPerLiter?: number };
  allFuelLogs: ProcessedFuelLog[];
}

export default function WelcomeBanner({ vehicle, allFuelLogs }: WelcomeBannerProps) {
  const lastLog = allFuelLogs?.[0];

  const handleStationSelect = (stationName: string) => {
    console.log("Selected gas station:", stationName);
  };
  
  const estimatedRefuel = useMemo(() => {
    if (!lastLog || !vehicle.averageConsumptionKmPerLiter || vehicle.averageConsumptionKmPerLiter <= 0 || allFuelLogs.length < 2) {
      return null;
    }
    
    // Estimate current fuel level
    let fuelSinceLastFillUp = 0;
    let isPartialFillChain = false;
    for (const log of allFuelLogs) {
        if (log.isFillUp) {
            break; // Stop when we find the last full fill-up
        }
        fuelSinceLastFillUp += log.liters;
        isPartialFillChain = true;
    }
    
    const lastFillUpLog = allFuelLogs.find(l => l.isFillUp);

    const currentFuel = isPartialFillChain 
      ? fuelSinceLastFillUp // If only partials exist, sum them up (less accurate)
      : (lastFillUpLog ? vehicle.fuelCapacityLiters - ((lastLog.odometer - lastFillUpLog.odometer) / vehicle.averageConsumptionKmPerLiter) : 0);

    if (currentFuel <= 0) return null;

    // Remaining autonomy
    const remainingKm = currentFuel * vehicle.averageConsumptionKmPerLiter;

    // Avg km per day
    const sortedLogs = [...allFuelLogs].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstLog = sortedLogs[0];
    const days = differenceInDays(new Date(lastLog.date), new Date(firstLog.date));
    const totalKm = lastLog.odometer - firstLog.odometer;
    const avgKmPerDay = days > 0 ? totalKm / days : 0;
    
    if (avgKmPerDay <= 0) return null;

    // Estimated next refuel
    const autonomyFromFullTank = vehicle.fuelCapacityLiters * vehicle.averageConsumptionKmPerLiter;
    const kmToNextRefuel = autonomyFromFullTank * 0.8; // Refuel at 20%
    
    const kmExpected = lastLog.odometer + kmToNextRefuel;
    const kmRemaining = kmExpected - lastLog.odometer;

    const daysToNextRefuel = kmRemaining / avgKmPerDay;
    const dateExpected = addDays(new Date(lastLog.date), daysToNextRefuel);


    return {
        kmExpected: Math.round(kmExpected),
        kmRemaining: Math.round(remainingKm),
        dateExpected: formatDate(dateExpected.toISOString()),
    }

  }, [allFuelLogs, vehicle, lastLog]);

  return (
    <Card className="overflow-hidden">
        <div className="flex flex-col">
             {vehicle.imageUrl && (
            <div className="relative w-full h-48 sm:h-64 bg-black/5">
                <Image
                    src={vehicle.imageUrl}
                    alt={`${vehicle.make} ${vehicle.model}`}
                    fill
                    className="object-cover"
                    data-ai-hint={vehicle.imageHint}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                <div className="absolute bottom-0 left-0 p-6 w-full">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                        <div>
                            <h2 className="font-headline text-3xl text-white shadow-lg">{vehicle.make} {vehicle.model}</h2>
                            <p className="text-white/90 text-base">{vehicle.year} - {vehicle.plate}</p>
                        </div>
                        {estimatedRefuel && (
                            <div className="bg-black/50 backdrop-blur-sm p-3 rounded-lg text-white">
                                <p className="font-semibold text-sm mb-2">Próxima Recarga (Estimado)</p>
                                <div className="flex gap-4">
                                     <div className="flex items-center gap-2">
                                        <Gauge className="h-4 w-4 text-white/80" />
                                        <div>
                                            <p className="font-bold">{estimatedRefuel.kmExpected.toLocaleString()} km</p>
                                            <p className="text-xs text-white/80">Faltan {estimatedRefuel.kmRemaining.toLocaleString()} km</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-white/80" />
                                        <div>
                                            <p className="font-bold">{estimatedRefuel.dateExpected}</p>
                                            <p className="text-xs text-white/80">Fecha Aprox.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            )}
             <CardContent className="p-6">
                <div className="flex items-center flex-wrap gap-2">
                    {vehicle && (
                      <AddFuelLogDialog vehicleId={vehicle.id} lastLog={lastLog} vehicle={vehicle}>
                        <Button size="sm" className="w-auto">
                          <Plus className="-ml-1 mr-2 h-4 w-4" />
                          Añadir Recarga
                        </Button>
                      </AddFuelLogDialog>
                    )}
                    {vehicle && (
                    <AddServiceReminderDialog vehicleId={vehicle.id} lastOdometer={lastLog?.odometer}>
                        <Button variant="secondary" size="sm" className="w-auto">
                          <Wrench className="mr-2 h-4 w-4" />
                          Añadir Recordatorio
                        </Button>
                    </AddServiceReminderDialog>
                    )}
                    <FindNearbyGasStationsDialog onStationSelect={handleStationSelect}>
                       <Button variant="secondary" size="sm" className="w-auto">
                          <Search className="mr-2 h-4 w-4" />
                          Buscar Gasolineras
                        </Button>
                    </FindNearbyGasStationsDialog>
                </div>
            </CardContent>
        </div>
    </Card>
  );
}
