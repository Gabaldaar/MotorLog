'use client';

import type { Trip, ProcessedFuelLog, Vehicle, TripExpense } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Map, Edit, Trash2, Clock, Droplets, Wallet, Route, CircleDollarSign, User, Wand2, Loader2 } from 'lucide-react';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import AddTripDialog from '../dashboard/add-trip-dialog';
import { Button } from '../ui/button';
import { useMemo, useState } from 'react';
import { differenceInHours, differenceInMinutes } from 'date-fns';
import { usePreferences } from '@/context/preferences-context';
import DeleteTripDialog from './delete-trip-dialog';
import { calculateCostsPerKm, calculateTotalCostInARS } from '@/lib/cost-calculator';
import { getDolarBlueRate } from '@/ai/flows/get-exchange-rate';
import { useToast } from '@/hooks/use-toast';

interface TripDetailsProps {
    trip: Trip;
    vehicle: Vehicle;
    allFuelLogs: ProcessedFuelLog[];
}

function TripDetails({ trip, vehicle, allFuelLogs }: TripDetailsProps) {
    const { getFormattedConsumption, consumptionUnit } = usePreferences();
    const { toast } = useToast();
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [isFetchingRate, setIsFetchingRate] = useState(false);
    
    const lastFuelLog = useMemo(() => {
        if (!allFuelLogs || allFuelLogs.length === 0) return null;
        return allFuelLogs.sort((a,b) => b.odometer - a.odometer)[0];
    }, [allFuelLogs]);

    const handleFetchRate = async () => {
        setIsFetchingRate(true);
        try {
            const rate = await getDolarBlueRate();
            setExchangeRate(rate.average);
            toast({
                title: 'Cotización Obtenida',
                description: `1 USD = ${formatCurrency(rate.average)} ARS`,
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al obtener cotización',
                description: error.message,
            });
        } finally {
            setIsFetchingRate(false);
        }
    };


    const tripCalculations = useMemo(() => {
        const fallbackConsumption = vehicle.averageConsumptionKmPerLiter > 0 ? vehicle.averageConsumptionKmPerLiter : 1;
        const lastPricePerLiter = lastFuelLog?.pricePerLiter || 0;
        
        const costsPerKm = calculateCostsPerKm(vehicle, fallbackConsumption, lastPricePerLiter);
        const totalCostPerKmInARS = exchangeRate ? calculateTotalCostInARS(costsPerKm, exchangeRate) : null;
        const fuelCostPerKmInARS = costsPerKm.fuelCostPerKm;


        if (!trip.endOdometer || !trip.startOdometer) {
            return { kmTraveled: 0, fuelConsumed: 0, fuelCost: 0, avgConsumptionForTrip: 0, costPerKm: 0, duration: "N/A", otherExpenses: 0, totalCost: 0, realTotalCost: null, realFuelCost: null };
        }
        const kmTraveled = trip.endOdometer - trip.startOdometer;
        if (kmTraveled <= 0) {
            return { kmTraveled: 0, fuelConsumed: 0, fuelCost: 0, avgConsumptionForTrip: 0, costPerKm: 0, duration: "N/A", otherExpenses: 0, totalCost: 0, realTotalCost: null, realFuelCost: null };
        }
        
        const otherExpenses = (trip.expenses || []).reduce((acc, expense) => acc + expense.amount, 0);

        const sortedLogs = [...allFuelLogs].sort((a, b) => a.odometer - b.odometer);
        const logsInTrip = sortedLogs.filter(log => log.odometer > trip.startOdometer! && log.odometer < trip.endOdometer!);
        const keyOdometerPoints = [trip.startOdometer, ...logsInTrip.map(l => l.odometer), trip.endOdometer];
        
        let totalFuel = 0;
        let fuelCost = 0;

        const historicAvgPrice = sortedLogs.length > 0 ? sortedLogs.reduce((acc, log) => acc + log.pricePerLiter, 0) / sortedLogs.length : 0;
        
        for (let i = 0; i < keyOdometerPoints.length - 1; i++) {
            const segmentStartOdo = keyOdometerPoints[i];
            const segmentEndOdo = keyOdometerPoints[i+1];
            const segmentDistance = segmentEndOdo - segmentStartOdo;

            if (segmentDistance <= 0) continue;

            const segmentStartLog = logsInTrip.find(l => l.odometer === segmentStartOdo);
            
            if (segmentStartLog && segmentStartLog.isFillUp && !segmentStartLog.missedPreviousFillUp) {
                const logIndex = sortedLogs.findIndex(l => l.id === segmentStartLog.id);
                if (logIndex > 0) {
                    const prevLog = sortedLogs[logIndex - 1];
                    const distanceSinceLastFill = segmentStartLog.odometer - prevLog.odometer;
                    if (distanceSinceLastFill > 0 && prevLog.isFillUp) {
                        const realConsumption = distanceSinceLastFill / segmentStartLog.liters;
                        if (realConsumption > 0) {
                            totalFuel += segmentDistance / realConsumption;
                            fuelCost += (segmentDistance / realConsumption) * segmentStartLog.pricePerLiter;
                            continue;
                        }
                    }
                }
            }
            
            totalFuel += segmentDistance / fallbackConsumption;
            fuelCost += (segmentDistance / fallbackConsumption) * historicAvgPrice;
        }

        const totalCost = fuelCost + otherExpenses;
        const finalAvgConsumption = kmTraveled > 0 && totalFuel > 0 ? kmTraveled / totalFuel : 0;
        const costPerKm = kmTraveled > 0 ? totalCost / kmTraveled : 0;

        let duration = "N/A";
        if (trip.endDate && trip.startDate) {
            const hours = differenceInHours(new Date(trip.endDate), new Date(trip.startDate));
            const minutes = differenceInMinutes(new Date(trip.endDate), new Date(trip.startDate)) % 60;
            duration = `${hours}h ${minutes}m`;
        }

        return {
            kmTraveled,
            fuelConsumed: totalFuel,
            fuelCost,
            avgConsumptionForTrip: finalAvgConsumption,
            costPerKm,
            duration,
            otherExpenses,
            totalCost,
            realTotalCost: totalCostPerKmInARS ? kmTraveled * totalCostPerKmInARS : null,
            realFuelCost: kmTraveled * fuelCostPerKmInARS,
        }
    }, [trip, allFuelLogs, vehicle.averageConsumptionKmPerLiter, exchangeRate, lastFuelLog]);

    const { kmTraveled, fuelConsumed, fuelCost, avgConsumptionForTrip, costPerKm, duration, otherExpenses, totalCost, realTotalCost, realFuelCost } = tripCalculations;
    const lastOdometer = trip.endOdometer || 0;

    return (
        <div className="space-y-3 pt-4 border-t pl-12">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6 text-sm">
                 <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{formatCurrency(totalCost)}</p>
                        <p className="text-xs text-muted-foreground">Costo de Viaje (Est.)</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{fuelConsumed.toFixed(2)} L ({formatCurrency(fuelCost)})</p>
                        <p className="text-xs text-muted-foreground">Combustible (Est.)</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{trip.username}</p>
                        <p className="text-xs text-muted-foreground">Conductor</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <Route className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{getFormattedConsumption(avgConsumptionForTrip)}</p>
                        <p className="text-xs text-muted-foreground">Consumo ({consumptionUnit})</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{formatCurrency(costPerKm)}</p>
                        <p className="text-xs text-muted-foreground">Costo / Km (Est.)</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                     <Clock className="h-4 w-4 text-muted-foreground" />
                     <div>
                        <p className="font-medium">{duration}</p>
                        <p className="text-xs text-muted-foreground">Duración</p>
                     </div>
                </div>
            </div>
             {trip.notes && (
                <div className="pt-2 text-sm">
                    <p className="font-medium">Notas:</p>
                    <p className="text-muted-foreground italic">{trip.notes}</p>
                </div>
            )}
            {(trip.expenses && trip.expenses.length > 0) && (
                 <div className="pt-2 text-sm">
                    <p className="font-medium">Otros Gastos ({formatCurrency(otherExpenses)}):</p>
                     <ul className="text-muted-foreground list-disc pl-5 mt-1">
                        {trip.expenses.map((expense, index) => (
                            <li key={index} className="flex justify-between">
                                <span>{expense.description}</span>
                                <span>{formatCurrency(expense.amount)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            <div className="pt-4 border-t space-y-4">
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <Button onClick={handleFetchRate} disabled={isFetchingRate} variant="outline" size="sm">
                        {isFetchingRate ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wand2 className="mr-2 h-4 w-4" />}
                        Calcular Costo Real
                    </Button>
                    {exchangeRate && <p className="text-xs text-muted-foreground">Usando cambio 1 USD = {formatCurrency(exchangeRate)}</p>}
                </div>
                {realTotalCost !== null && realFuelCost !== null && (
                    <div className="grid grid-cols-2 gap-4 text-sm rounded-lg bg-muted/50 p-3">
                        <div>
                            <p className="font-semibold text-base">{formatCurrency(realFuelCost)}</p>
                            <p className="text-xs text-muted-foreground">Costo Combustible Real</p>
                        </div>
                        <div>
                            <p className="font-semibold text-base">{formatCurrency(realTotalCost)}</p>
                            <p className="text-xs text-muted-foreground">Costo Total Real</p>
                        </div>
                    </div>
                )}
            </div>

             <div className="flex gap-2 pt-4">
                <AddTripDialog vehicleId={trip.vehicleId} trip={trip} lastOdometer={lastOdometer}>
                    <Button variant="outline" size="sm" className="w-full">
                        <Edit className="h-4 w-4 mr-1" /> Ver/Editar
                    </Button>
                </AddTripDialog>
                <DeleteTripDialog vehicleId={trip.vehicleId} tripId={trip.id}>
                  <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                  </Button>
                </DeleteTripDialog>
            </div>
        </div>
    );
}


export default function CompletedTrips({ trips, vehicle, allFuelLogs }: CompletedTripsProps) {
  if (trips.length === 0) {
    return null;
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
                      {formatDateTime(trip.startDate)}
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
                <TripDetails trip={trip} vehicle={vehicle} allFuelLogs={allFuelLogs} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
