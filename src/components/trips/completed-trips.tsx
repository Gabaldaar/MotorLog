

'use client';

import type { Trip, ProcessedFuelLog, Vehicle } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Map, Edit, Trash2, Clock, Wallet, Route, User, Wand2, Loader2, DollarSign } from 'lucide-react';
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
        if (!trip.endOdometer || !trip.startOdometer || trip.endOdometer < trip.startOdometer) {
            return { kmTraveled: 0, duration: "N/A", otherExpenses: 0, detailedCostsARS: null };
        }
        
        const kmTraveled = trip.endOdometer - trip.startOdometer;
        const fallbackConsumption = vehicle.averageConsumptionKmPerLiter > 0 ? vehicle.averageConsumptionKmPerLiter : 1;
        const lastPricePerLiter = lastFuelLog?.pricePerLiter || 0;
        const { costPerKmUSD, fuelCostPerKmARS } = calculateCostsPerKm(vehicle, fallbackConsumption, lastPricePerLiter);
        const detailedCostsARS = calculateTotalCostInARS(costPerKmUSD, fuelCostPerKmARS, exchangeRate);

        const otherExpenses = (trip.expenses || []).reduce((acc, expense) => acc + expense.amount, 0);

        let duration = "N/A";
        if (trip.endDate && trip.startDate) {
            const hours = differenceInHours(new Date(trip.endDate), new Date(trip.startDate));
            const minutes = differenceInMinutes(new Date(trip.endDate), new Date(trip.startDate)) % 60;
            duration = `${hours}h ${minutes}m`;
        }

        return { kmTraveled, duration, otherExpenses, detailedCostsARS };
    }, [trip, vehicle, allFuelLogs, exchangeRate, lastFuelLog]);

    const { kmTraveled, duration, otherExpenses, detailedCostsARS } = tripCalculations;
    const lastOdometer = trip.endOdometer || 0;

    const fixedCostForTrip = detailedCostsARS ? kmTraveled * detailedCostsARS.fixedCostPerKm_ARS : 0;
    const variableCostForTrip = detailedCostsARS ? kmTraveled * detailedCostsARS.variableCostPerKm_ARS : 0;
    const fuelCostForTrip = detailedCostsARS ? kmTraveled * detailedCostsARS.fuelCostPerKm_ARS : 0;
    const totalRealCostForTrip_CTR = detailedCostsARS ? kmTraveled * detailedCostsARS.totalCostPerKm_ARS : 0;
    const tripExpenses = otherExpenses;
    const fuelPlusExpenses = fuelCostForTrip + tripExpenses;
    const fuelPlusVariablePlusExpenses = fuelCostForTrip + variableCostForTrip + tripExpenses;
    const totalRealCostPlusExpenses = totalRealCostForTrip_CTR + tripExpenses;


    return (
        <div className="space-y-4 pt-4 border-t pl-12">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6 text-sm">
                 <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{trip.username}</p>
                        <p className="text-xs text-muted-foreground">Conductor</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                     <Clock className="h-4 w-4 text-muted-foreground" />
                     <div>
                        <p className="font-medium">{duration}</p>
                        <p className="text-xs text-muted-foreground">Duración</p>
                     </div>
                </div>
                {tripExpenses > 0 && (
                    <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="font-medium">{formatCurrency(tripExpenses)}</p>
                            <p className="text-xs text-muted-foreground">Gastos del Viaje (GV)</p>
                        </div>
                    </div>
                )}
            </div>
            
             {trip.notes && (
                <div className="pt-2 text-sm">
                    <p className="font-medium">Notas:</p>
                    <p className="text-muted-foreground italic">{trip.notes}</p>
                </div>
            )}
            {(trip.expenses && trip.expenses.length > 0) && (
                 <div className="pt-2 text-sm">
                    <p className="font-medium">Detalle Gastos del Viaje:</p>
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
                     <div className="w-full sm:w-auto">
                        <Label htmlFor={`exchange-rate-${trip.id}`} className="text-xs text-muted-foreground">Tipo de Cambio (Guardado)</Label>
                        <Input 
                            id={`exchange-rate-${trip.id}`}
                            type="text" 
                            placeholder="Sin valor guardado"
                            value={exchangeRate !== null ? exchangeRate.toLocaleString('es-AR') : ''}
                            onChange={(e) => setExchangeRate(parseCurrency(e.target.value))}
                            className="h-9"
                        />
                    </div>
                    <Button onClick={handleFetchRate} disabled={isFetchingRate} variant="outline" size="sm" className="w-full sm:w-auto mt-4 sm:mt-0">
                        {isFetchingRate ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wand2 className="mr-2 h-4 w-4" />}
                        Usar Cambio Actual
                    </Button>
                </div>
                
                {exchangeRate !== null && detailedCostsARS ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                                <p className="font-semibold text-sm flex items-center gap-2">C. Fijos (CF)</p>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">CF/km:</span>
                                    <span className="font-medium">{formatCurrency(detailedCostsARS.fixedCostPerKm_ARS)}</span>
                                </div>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">CF x KmR:</span>
                                    <span className="font-medium">{formatCurrency(fixedCostForTrip)}</span>
                                </div>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                                <p className="font-semibold text-sm flex items-center gap-2">C. Variables (CV)</p>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">CV/km:</span>
                                    <span className="font-medium">{formatCurrency(detailedCostsARS.variableCostPerKm_ARS)}</span>
                                </div>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">CV x KmR:</span>
                                    <span className="font-medium">{formatCurrency(variableCostForTrip)}</span>
                                </div>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                                <p className="font-semibold text-sm flex items-center gap-2">C. Combustible (CC)</p>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">CC/km:</span>
                                    <span className="font-medium">{formatCurrency(detailedCostsARS.fuelCostPerKm_ARS)}</span>
                                </div>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">CC x KmR:</span>
                                    <span className="font-medium">{formatCurrency(fuelCostForTrip)}</span>
                                </div>
                            </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-3 rounded-lg border">
                                <p className="text-xs text-muted-foreground">CCxKmR + GV</p>
                                <p className="font-semibold text-lg">{formatCurrency(fuelPlusExpenses)}</p>
                            </div>
                             <div className="p-3 rounded-lg border">
                                <p className="text-xs text-muted-foreground">CCxKmR + CVxKmR + GV</p>
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
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-md">
                        {trip.exchangeRate 
                            ? "Calculando costos..." 
                            : "Ingresa o busca un tipo de cambio para calcular los costos totales del viaje. Para guardarlo, edita el viaje."
                        }
                    </div>
                )}
            </div>

             <div className="flex gap-2 pt-4 border-t">
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


export default function CompletedTrips({ trips, vehicle, allFuelLogs }: TripDetailsProps) {
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
