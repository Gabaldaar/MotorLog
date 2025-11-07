'use client';

import Image from 'next/image';
import type { Vehicle, ProcessedFuelLog } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import AddFuelLogDialog from './add-fuel-log-dialog';
import { Wrench, Plus, MapPin } from 'lucide-react';
import AddServiceReminderDialog from './add-service-reminder-dialog';
import { Button } from '../ui/button';
import EstimatedRefuelCard from '../ai/estimated-refuel-card';


interface WelcomeBannerProps {
  vehicle: Vehicle & { averageConsumptionKmPerLiter?: number };
  lastLog?: ProcessedFuelLog;
}

export default function WelcomeBanner({ vehicle, lastLog }: WelcomeBannerProps) {

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
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div className="absolute bottom-0 left-0 p-6">
                    <h2 className="font-headline text-3xl text-white shadow-lg">{vehicle.make} {vehicle.model}</h2>
                    <p className="text-white/90 text-base">{vehicle.year} - {vehicle.plate}</p>
                </div>
            </div>
            )}
             <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
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
                </div>
                <EstimatedRefuelCard vehicle={vehicle} lastLog={lastLog} />
            </CardContent>
        </div>
    </Card>
  );
}
