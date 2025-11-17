'use client';

import type { Trip, ProcessedFuelLog, Vehicle } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Map, Edit, Trash2, Clock, Droplets, Wallet, Route, User, Wand2, Loader2, TrendingUp, DollarSign } from 'lucide-react';
import { formatDateTime, formatCurrency, parseCurrency } from '@/lib/utils';
import AddTripDialog from '../dashboard/add-trip-dialog';
import { Button } from '../ui/button';
import { useMemo, useState } from 'react';
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
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [isFetchingRate, setIsFetchingRate] = useState(false);
    
    const lastFuelLog = useMemo(() => {
        if (!allFuelLogs || allFuelLogs.length === 0) return null;
        return allFuelLogs.sort((a,b) => b.odometer - a.odometer)[0];
    }, [allFuelLogs]);

    const handleFetchRate = async () => {
        setIsFetchingRate(true);
        try {
            const rate = await getOfficialDolarRate();
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
        
        const fuelCostPerKm_ARS = costsPerKm.fuelCostPerKm;
        const totalVehicleCostPerKm_ARS = exchangeRate ? calculateTotalCostInARS(costsPerKm, exchangeRate) : null;

        if (!trip.endOdometer || !trip.startOdometer) {
            return { kmTraveled: 0, duration: "N/A", otherExpenses: 0, fuelCostPerKm_ARS, totalVehicleCostPerKm_ARS };
        }
        const kmTraveled = trip.endOdometer - trip.startOdometer;
        if (kmTraveled < 0) {
             return { kmTraveled: 0, duration: "N/A", otherExpenses: 0, fuelCostPerKm_ARS, totalVehicleCostPerKm_ARS };
        }
        
        const otherExpenses = (trip.expenses || []).reduce((acc, expense) => acc + expense.amount, 0);

        let duration = "N/A";
        if (trip.endDate && trip.startDate) {
            const hours = differenceInHours(new Date(trip.endDate), new Date(trip.startDate));
            const minutes = differenceInMinutes(new Date(trip.endDate), new Date(trip.startDate)) % 60;
            duration = `${hours}h ${minutes}m`;
        }

        return {
            kmTraveled,
            duration,
            otherExpenses,
            fuelCostPerKm_ARS,
            totalVehicleCostPerKm_ARS,
        }
    }, [trip, vehicle, allFuelLogs, exchangeRate, lastFuelLog]);

    const { kmTraveled, duration, otherExpenses, fuelCostPerKm_ARS, totalVehicleCostPerKm_ARS } = tripCalculations;
    
    const lastOdometer = trip.endOdometer || 0;
    
    const fuelCostForTrip = kmTraveled * fuelCostPerKm_ARS;
    const totalVehicleCostForTrip = totalVehicleCostPerKm_ARS ? kmTraveled * totalVehicleCostPerKm_ARS : null;
    
    const fuelCostPlusExpenses = fuelCostForTrip + otherExpenses;
    const totalRealCostOfTrip = totalVehicleCostForTrip ? totalVehicleCostForTrip + otherExpenses : null;


    return (
        <div className="space-y-4 pt-4 border-t pl-12">
            {/* Basic Trip Info */}
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
                {otherExpenses > 0 && (
                    <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="font-medium">{formatCurrency(otherExpenses)}</p>
                            <p className="text-xs text-muted-foreground">Otros Gastos</p>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Notes and Expenses details */}
             {trip.notes && (
                <div className="pt-2 text-sm">
                    <p className="font-medium">Notas:</p>
                    <p className="text-muted-foreground italic">{trip.notes}</p>
                </div>
            )}
            {(trip.expenses && trip.expenses.length > 0) && (
                 <div className="pt-2 text-sm">
                    <p className="font-medium">Detalle Otros Gastos:</p>
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
            
            {/* Cost Calculation Section */}
            <div className="pt-4 border-t space-y-4">
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <Button onClick={handleFetchRate} disabled={isFetchingRate} variant="outline" size="sm">
                        {isFetchingRate ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wand2 className="mr-2 h-4 w-4" />}
                        Usar Cambio Actual
                    </Button>
                    <div className="w-full sm:w-auto">
                        <Label htmlFor={`exchange-rate-${trip.id}`} className="sr-only">Tipo de Cambio</Label>
                        <Input 
                            id={`exchange-rate-${trip.id}`}
                            type="text" 
                            placeholder="...o ingresa un valor"
                            value={exchangeRate !== null ? exchangeRate.toLocaleString('es-AR') : ''}
                            onChange={(e) => setExchangeRate(parseCurrency(e.target.value))}
                            className="h-9"
                        />
                    </div>
                </div>
                
                {exchangeRate !== null && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Fuel Cost Breakdown */}
                            <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                                <p className="font-semibold text-sm flex items-center gap-2"><Droplets className="h-4 w-4"/>Costos de Combustible</p>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">Costo/km:</span>
                                    <span className="font-medium">{formatCurrency(fuelCostPerKm_ARS)}</span>
                                </div>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">Total ({kmTraveled.toLocaleString()} km):</span>
                                    <span className="font-medium">{formatCurrency(fuelCostForTrip)}</span>
                                </div>
                            </div>

                            {/* Total Vehicle Cost Breakdown */}
                            {totalVehicleCostPerKm_ARS !== null && (
                                <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                                    <p className="font-semibold text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4"/>Costo Total del Vehículo</p>
                                     <div className="flex justify-between items-baseline text-sm">
                                        <span className="text-muted-foreground">Costo/km Real:</span>
                                        <span className="font-medium">{formatCurrency(totalVehicleCostPerKm_ARS)}</span>
                                    </div>
                                    <div className="flex justify-between items-baseline text-sm">
                                        <span className="text-muted-foreground">Total ({kmTraveled.toLocaleString()} km):</span>
                                        <span className="font-medium">{formatCurrency(totalVehicleCostForTrip!)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Separator />

                        {/* Final Trip Costs including other expenses */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 rounded-lg border">
                                <p className="text-xs text-muted-foreground">Combustible + Otros Gastos</p>
                                <p className="font-semibold text-lg">{formatCurrency(fuelCostPlusExpenses)}</p>
                            </div>
                            {totalRealCostOfTrip !== null && (
                                <div className="p-3 rounded-lg border border-primary/50 bg-primary/10">
                                    <p className="text-xs text-primary/80">Costo Total Real del Viaje</p>
                                    <p className="font-semibold text-lg text-primary">{formatCurrency(totalRealCostOfTrip)}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
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
