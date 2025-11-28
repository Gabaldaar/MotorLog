

'use client';

import type { Trip, ProcessedFuelLog, Vehicle, TripStage } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Map, Edit, Trash2, Clock, Wallet, Route, User, Wand2, Loader2, DollarSign, ChevronsRight, Calculator } from 'lucide-react';
import { formatDateTime, formatCurrency, parseCurrency } from '@/lib/utils';
import AddTripDialog from '../dashboard/add-trip-dialog';
import { Button } from '../ui/button';
import { useMemo, useState, useEffect } from 'react';
import { differenceInHours, differenceInMinutes } from 'date-fns';
import DeleteTripDialog from './delete-trip-dialog';
import { calculateCostsPerKm, calculateTotalCostInARS } from '@/lib/cost-calculator';
import { getOfficialDolarRate } from '@/ai/flows/get-exchange-rate';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '../ui/separator';
import { Label } from '../ui/label';
import { Input } from '../ui/input';

interface TripDetailsProps {
    trip: Trip;
    vehicle: Vehicle;
    allFuelLogs: ProcessedFuelLog[];
}

function TripDetails({ trip, vehicle, allFuelLogs }: TripDetailsProps) {
    const { toast } = useToast();
    const [exchangeRate, setExchangeRate] = useState<number | null>(trip.exchangeRate || null);
    const [isFetchingRate, setIsFetchingRate] = useState(false);
    
    useEffect(() => {
        setExchangeRate(trip.exchangeRate || null);
    }, [trip.exchangeRate]);

    const lastFuelLog = useMemo(() => {
        if (!allFuelLogs || allFuelLogs.length === 0) return null;
        return allFuelLogs.sort((a,b) => b.odometer - a.odometer)[0];
    }, [allFuelLogs]);

    const handleFetchRate = async () => {
        if (exchangeRate !== null && exchangeRate > 0) {
            toast({
                variant: 'default',
                title: 'Valor existente',
                description: 'El campo de tipo de cambio ya tiene un valor. Para buscar uno nuevo, primero borra el valor actual.',
            });
            return;
        }

        setIsFetchingRate(true);
        try {
            const rateData = await getOfficialDolarRate();
            setExchangeRate(rateData.rate);
            toast({
                title: 'Cotización Obtenida',
                description: `1 USD = ${formatCurrency(rateData.rate)} ARS`,
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
        const { costPerKmUSD, fuelCostPerKmARS } = calculateCostsPerKm(vehicle, fallbackConsumption, lastPricePerLiter);
        const detailedCostsARS = calculateTotalCostInARS(costPerKmUSD, fuelCostPerKmARS, exchangeRate);
        
        let lastOdometer = trip.startOdometer;
        const processedStages = (trip.stages || []).map(stage => {
            const kmTraveled = stage.stageEndOdometer - lastOdometer;
            const otherExpenses = (stage.expenses || []).reduce((acc, exp) => acc + exp.amount, 0);
            
            const stageFuelCost = kmTraveled * detailedCostsARS.fuelCostPerKm_ARS;
            const stageVariableCost = kmTraveled * detailedCostsARS.variableCostPerKm_ARS;
            const stageFixedCost = kmTraveled * detailedCostsARS.fixedCostPerKm_ARS;

            const stageFuelPlusExpenses = stageFuelCost + otherExpenses;
            const stageFuelPlusVariablePlusExpenses = stageFuelCost + stageVariableCost + otherExpenses;
            const stageTotalRealCost = (kmTraveled * detailedCostsARS.totalCostPerKm_ARS) + otherExpenses;

            lastOdometer = stage.stageEndOdometer;
            
            return { 
                ...stage, 
                kmTraveled, 
                otherExpenses, 
                stageFuelPlusExpenses,
                stageFuelPlusVariablePlusExpenses,
                stageTotalRealCost,
            };
        });

        const totalKm = processedStages.reduce((acc, stage) => acc + stage.kmTraveled, 0);
        const totalOtherExpenses = processedStages.reduce((acc, stage) => acc + stage.otherExpenses, 0);

        const fixedCostForTrip = totalKm * detailedCostsARS.fixedCostPerKm_ARS;
        const variableCostForTrip = totalKm * detailedCostsARS.variableCostPerKm_ARS;
        const fuelCostForTrip = totalKm * detailedCostsARS.fuelCostPerKm_ARS;
        
        const fuelPlusExpenses = fuelCostForTrip + totalOtherExpenses;
        const fuelPlusVariablePlusExpenses = fuelCostForTrip + variableCostForTrip + totalOtherExpenses;
        const totalRealCostPlusExpenses = (totalKm * detailedCostsARS.totalCostPerKm_ARS) + totalOtherExpenses;

        let duration = "N/A";
        if (trip.stages && trip.stages.length > 0 && trip.startDate) {
            const lastStage = trip.stages[trip.stages.length - 1];
            const hours = differenceInHours(new Date(lastStage.stageEndDate), new Date(trip.startDate));
            const minutes = differenceInMinutes(new Date(lastStage.stageEndDate), new Date(trip.startDate)) % 60;
            duration = `${hours}h ${minutes}m`;
        }

        return { 
            processedStages, 
            totalKm, 
            duration, 
            tripExpenses: totalOtherExpenses,
            fuelPlusExpenses,
            fuelPlusVariablePlusExpenses,
            totalRealCostPlusExpenses,
            detailedCostsARS,
        };

    }, [trip, vehicle, allFuelLogs, exchangeRate, lastFuelLog]);

    const { 
        processedStages,
        totalKm,
        duration,
        tripExpenses,
        fuelPlusExpenses,
        fuelPlusVariablePlusExpenses,
        totalRealCostPlusExpenses,
        detailedCostsARS
     } = tripCalculations;
    const lastOdometerInTrip = (trip.stages && trip.stages.length > 0) ? trip.stages[trip.stages.length-1].stageEndOdometer : trip.startOdometer;

    return (
        <div className="space-y-4 pt-4 border-t pl-4 sm:pl-12">
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <Route className="h-4 w-4 text-muted-foreground" />
                    <div><p className="font-medium">{totalKm.toLocaleString()} km</p><p className="text-xs text-muted-foreground">Distancia Total</p></div>
                </div>
                <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div><p className="font-medium">{duration}</p><p className="text-xs text-muted-foreground">Duración Total</p></div>
                </div>
                <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <div><p className="font-medium">{formatCurrency(tripExpenses)}</p><p className="text-xs text-muted-foreground">Gastos del Viaje (GV)</p></div>
                </div>
                <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div><p className="font-medium">{trip.username}</p><p className="text-xs text-muted-foreground">Conductor</p></div>
                </div>
            </div>
            {trip.notes && <p className="text-xs italic text-muted-foreground">Notas Generales: {trip.notes}</p>}

            <Separator />

            <div>
                <p className="text-sm font-medium mb-2">Detalle de Etapas</p>
                <div className="space-y-3">
                    {processedStages.map((stage, index) => (
                        <div key={stage.id} className="p-3 rounded-lg bg-muted/40 border text-sm">
                            <div className="flex justify-between items-start">
                                <p className="font-semibold text-primary flex items-center gap-2">
                                    <ChevronsRight className="h-5 w-5" />
                                    Etapa {index + 1}: {stage.kmTraveled.toLocaleString()} km
                                </p>
                            </div>
                            <div className="pl-7 mt-2 space-y-2">
                                {stage.notes && <p className="text-xs italic text-muted-foreground">Notas: {stage.notes}</p>}
                                {(stage.expenses && stage.expenses.length > 0) && (
                                    <div className="pt-1 text-xs">
                                        <p className="font-medium">Gastos de la Etapa:</p>
                                        <ul className="text-muted-foreground list-disc pl-5 mt-1">
                                            {stage.expenses.map((expense, i) => (
                                                <li key={i} className="flex justify-between">
                                                    <span>{expense.description}</span>
                                                    <span>{formatCurrency(expense.amount)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {exchangeRate && (
                                    <div className="pt-2 border-t border-muted/50 mt-2 text-xs space-y-1">
                                      <div className="flex justify-between"><span className="text-muted-foreground">CCxKmR + GV:</span> <span className="font-medium">{formatCurrency(stage.stageFuelPlusExpenses)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">CCxKmR + CVxKmR + GV:</span> <span className="font-medium">{formatCurrency(stage.stageFuelPlusVariablePlusExpenses)}</span></div>
                                      <div className="flex justify-between font-semibold text-primary"><span className="text-primary/80">CTR x KmR + GV (Total Real):</span> <span>{formatCurrency(stage.stageTotalRealCost)}</span></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Separator />
            
            <div className="space-y-4">
                 <p className="text-sm font-medium">Cálculos de Costo Total del Viaje (ARS)</p>
                 <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                     <div className="w-full sm:w-auto">
                        <Label htmlFor={`exchange-rate-${trip.id}`} className="text-xs text-muted-foreground">Tipo de Cambio (1 USD a ARS)</Label>
                        <Input 
                            id={`exchange-rate-${trip.id}`}
                            type="text" 
                            placeholder="Sin valor"
                            value={exchangeRate !== null ? exchangeRate.toLocaleString('es-AR') : ''}
                            onChange={(e) => setExchangeRate(parseCurrency(e.target.value))}
                            className="h-9"
                        />
                    </div>
                    <Button onClick={handleFetchRate} disabled={isFetchingRate} variant="outline" size="sm" className="w-full sm:w-auto mt-4 sm:mt-0">
                        {isFetchingRate ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wand2 className="mr-2 h-4 w-4" />}
                        Usar Actual
                    </Button>
                </div>

                {!exchangeRate ? (
                    <p className="text-xs text-muted-foreground text-center p-4 bg-muted/40 rounded-md">
                        Ingresa un tipo de cambio para ver los costos totales.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg border">
                            <p className="text-xs text-muted-foreground">CC x KmR + GV</p>
                            <p className="font-semibold text-lg">{formatCurrency(fuelPlusExpenses)}</p>
                        </div>
                            <div className="p-3 rounded-lg border">
                            <p className="text-xs text-muted-foreground">CC x KmR + CV x KmR + GV</p>
                            <p className="font-semibold text-lg">{formatCurrency(fuelPlusVariablePlusExpenses)}</p>
                        </div>
                            <div className="p-3 rounded-lg border">
                            <p className="text-xs text-muted-foreground">CTR/km</p>
                            <p className="font-semibold text-lg">{formatCurrency(detailedCostsARS.totalCostPerKm_ARS || 0)}</p>
                        </div>
                        <div className="p-3 rounded-lg border border-primary/50 bg-primary/10">
                            <p className="text-xs text-primary/80">CTR x KmR + GV (Costo Total Real)</p>
                            <p className="font-semibold text-lg text-primary">{formatCurrency(totalRealCostPlusExpenses)}</p>
                        </div>
                    </div>
                )}

            </div>

             <div className="flex gap-2 pt-4 border-t">
                <AddTripDialog vehicleId={trip.vehicleId} trip={trip} lastOdometer={lastOdometerInTrip}>
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

interface CompletedTripsProps {
    trips: Trip[];
    vehicle: Vehicle;
    allFuelLogs: ProcessedFuelLog[];
}

export default function CompletedTrips({ trips, vehicle, allFuelLogs }: CompletedTripsProps) {
  if (trips.length === 0) {
    return null;
  }

  const getTripSummary = (trip: Trip) => {
    if (!trip.stages || trip.stages.length === 0) {
      // @ts-ignore - endOdometer might not exist on new Trip type, but does on old data
      const distance = (trip.endOdometer || trip.startOdometer) - trip.startOdometer;
      // @ts-ignore
      const endDate = trip.endDate || trip.startDate;
      return { distance, endDate };
    }
    const lastStage = trip.stages[trip.stages.length - 1];
    const distance = lastStage.stageEndOdometer - trip.startOdometer;
    const endDate = lastStage.stageEndDate;
    return { distance, endDate };
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline text-2xl">Historial de Viajes</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {trips.map(trip => {
            const summary = getTripSummary(trip);
            return (
                <AccordionItem value={trip.id} key={trip.id}>
                <AccordionTrigger className="px-4 sm:px-6 py-4 text-left hover:no-underline">
                    <div className="flex items-center gap-4 w-full">
                    <Map className="h-8 w-8 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold">{trip.tripType}: {trip.destination}</p>
                        <p className="text-sm text-muted-foreground truncate">
                        Finalizado el {formatDateTime(summary.endDate)}
                        </p>
                    </div>
                    <div className="text-right ml-2">
                        <p className="font-semibold">
                        {summary.distance.toLocaleString()} km
                        </p>
                        <p className="text-xs text-muted-foreground">Distancia Total</p>
                    </div>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 sm:px-6 pb-4">
                    <TripDetails trip={trip} vehicle={vehicle} allFuelLogs={allFuelLogs} />
                </AccordionContent>
                </AccordionItem>
            )
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
