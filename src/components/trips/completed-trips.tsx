'use client';

import type { Trip, ProcessedFuelLog } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Map, Calendar, Gauge, Info, Edit, Trash2, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import AddTripDialog from '../dashboard/add-trip-dialog';
import { Button } from '../ui/button';
import { useMemo } from 'react';
import { differenceInHours, differenceInMinutes } from 'date-fns';
import { usePreferences } from '@/context/preferences-context';

interface CompletedTripsProps {
    trips: Trip[];
    vehicleId: string;
    allFuelLogs: ProcessedFuelLog[];
}

function TripDetails({ trip, fuelLogsForTrip }: { trip: Trip, fuelLogsForTrip: ProcessedFuelLog[] }) {
    const { getFormattedConsumption, consumptionUnit } = usePreferences();
    const kmTraveled = trip.endOdometer && trip.startOdometer ? trip.endOdometer - trip.startOdometer : 0;
    
    const {
        fuelConsumed,
        totalCost,
        avgConsumption,
        costPerKm,
        duration
    } = useMemo(() => {
        const fuelConsumed = fuelLogsForTrip.reduce((acc, log) => acc + log.liters, 0);
        const totalCost = fuelLogsForTrip.reduce((acc, log) => acc + log.totalCost, 0);
        
        const avgConsumption = kmTraveled > 0 && fuelConsumed > 0 ? (kmTraveled / fuelConsumed) : 0;
        const costPerKm = kmTraveled > 0 && totalCost > 0 ? (totalCost / kmTraveled) : 0;

        let duration = "N/A";
        if (trip.endDate && trip.startDate) {
            const hours = differenceInHours(new Date(trip.endDate), new Date(trip.startDate));
            const minutes = differenceInMinutes(new Date(trip.endDate), new Date(trip.startDate)) % 60;
            duration = `${hours}h ${minutes}m`;
        }

        return {
            fuelConsumed,
            totalCost,
            avgConsumption,
            costPerKm,
            duration
        }
    }, [trip, fuelLogsForTrip, kmTraveled]);


    return (
        <div className="space-y-3 pt-4 border-t pl-12">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                    <p className="font-medium">{fuelConsumed.toFixed(2)} L</p>
                    <p className="text-xs text-muted-foreground">Combustible Consumido</p>
                </div>
                <div>
                    <p className="font-medium">${totalCost.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Costo Total</p>
                </div>
                <div>
                    <p className="font-medium">{getFormattedConsumption(avgConsumption)}</p>
                    <p className="text-xs text-muted-foreground">Consumo ({consumptionUnit})</p>
                </div>
                 <div>
                    <p className="font-medium">${costPerKm.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Costo / Km</p>
                </div>
                 <div className="flex items-center gap-1.5">
                     <Clock className="h-4 w-4 text-muted-foreground" />
                     <div>
                        <p className="font-medium">{duration}</p>
                        <p className="text-xs text-muted-foreground">Duración</p>
                     </div>
                </div>
            </div>
             {trip.notes && (
                <div className="pt-2 text-sm">
                    <p className="font-medium flex items-center gap-2"><Info className="h-4 w-4"/> Notas</p>
                    <p className="text-muted-foreground italic pl-6">{trip.notes}</p>
                </div>
            )}
             <div className="flex gap-2 pt-4">
                <AddTripDialog vehicleId={trip.vehicleId} trip={trip} lastOdometer={trip.endOdometer || 0}>
                    <Button variant="outline" size="sm" className="w-full">
                        <Edit className="h-4 w-4 mr-1" /> Ver/Editar
                    </Button>
                </AddTripDialog>
                <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" disabled>
                    <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                </Button>
            </div>
        </div>
    );
}


export default function CompletedTrips({ trips, vehicleId, allFuelLogs }: CompletedTripsProps) {
  if (trips.length === 0) {
    return null;
  }
  
  const getFuelLogsForTrip = (trip: Trip) => {
    if (!trip.startOdometer || !trip.endOdometer) return [];
    return allFuelLogs.filter(log => log.odometer > trip.startOdometer! && log.odometer <= trip.endOdometer!);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline text-2xl">Historial de Viajes</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {trips.map(trip => (
            <AccordionItem value={trip.id} key={trip.id}>
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <div className="flex items-center gap-4 w-full">
                  <Map className="h-8 w-8 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{trip.tripType}: {trip.destination}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {formatDate(trip.startDate)} - {trip.endDate ? formatDate(trip.endDate) : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {trip.endOdometer && trip.startOdometer ? (trip.endOdometer - trip.startOdometer).toLocaleString() : '0'} km
                    </p>
                    <p className="text-xs text-muted-foreground">Distancia</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <TripDetails trip={trip} fuelLogsForTrip={getFuelLogsForTrip(trip)} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
