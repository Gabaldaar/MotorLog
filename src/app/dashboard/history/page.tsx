'use client';

import { useState, useEffect, useMemo } from 'react';
import type { ProcessedFuelLog, ServiceReminder, TimelineItem, ProcessedServiceReminder, Vehicle, Trip } from '@/lib/types';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Fuel, 
  Wrench, 
  Calendar, 
  Gauge, 
  Tag, 
  Building, 
  User as UserIcon, 
  Edit, 
  Trash2,
  DollarSign,
  History,
  CheckCircle2,
  AlertTriangle,
  Map,
  Clock,
  Wallet,
  Droplets
} from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import AddFuelLogDialog from '@/components/dashboard/add-fuel-log-dialog';
import DeleteFuelLogDialog from '@/components/dashboard/delete-fuel-log-dialog';
import AddServiceReminderDialog from '@/components/dashboard/add-service-reminder-dialog';
import DeleteServiceReminderDialog from '@/components/dashboard/delete-service-reminder-dialog';
import { usePreferences } from '@/context/preferences-context';
import { differenceInDays, differenceInHours, differenceInMinutes, startOfDay, endOfDay, subDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import type { EstimateFuelStopOutput } from '@/ai/flows/estimate-fuel-stop';
import { ai } from '@/ai/client';
import EstimatedRefuelCard from '@/components/dashboard/estimated-refuel-card';
import AddTripDialog from '@/components/dashboard/add-trip-dialog';
import DeleteTripDialog from '@/components/trips/delete-trip-dialog';
import { DateRangePicker } from '@/components/reports/date-range-picker';
import type { DateRange } from 'react-day-picker';

type TimelineHistoryItem = {
    type: 'fuel' | 'service' | 'trip';
    sortKey: number; // Odometer or timestamp
    date: string;
    data: ProcessedFuelLog | ProcessedServiceReminder | Trip;
};

function processFuelLogsForAvg(logs: ProcessedFuelLog[]): { processedLogs: ProcessedFuelLog[], avgConsumption: number } {
  const sortedLogs = logs
    .filter(log => log && typeof log.date === 'string')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const processed = sortedLogs.map((log, index) => {
    if (index === 0) {
      return { ...log };
    }
    const prevLog = sortedLogs[index - 1];
    if (!prevLog) return {...log};
    
    const distanceTraveled = log.odometer - prevLog.odometer;
    const consumption = prevLog.isFillUp && !log.missedPreviousFillUp && distanceTraveled > 0 && log.liters > 0 
      ? distanceTraveled / log.liters 
      : 0;
    
    return {
      ...log,
      distanceTraveled,
      consumption: parseFloat(consumption.toFixed(2)),
    };
  }).reverse(); 

  const consumptionLogs = processed.filter(log => log.consumption && log.consumption > 0);
  const avgConsumption = consumptionLogs.length > 0 
    ? consumptionLogs.reduce((acc, log) => acc + (log.consumption || 0), 0) / consumptionLogs.length
    : 0;

  return { processedLogs: processed, avgConsumption };
}


export default function HistoryPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { urgencyThresholdDays, urgencyThresholdKm } = usePreferences();
  const [estimate, setEstimate] = useState<EstimateFuelStopOutput | null>(null);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  const fuelLogsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('odometer', 'desc')
    );
  }, [firestore, user, vehicle]);

  const remindersQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'service_reminders')
    );
  }, [firestore, user, vehicle]);
  
  const tripsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'trips'),
      orderBy('endDate', 'desc')
    );
  }, [firestore, user, vehicle]);
  
  const lastFuelLogQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('odometer', 'desc'),
      limit(1)
    );
  }, [firestore, user, vehicle]);

  const { data: fuelLogs, isLoading: isLoadingLogs } = useCollection<ProcessedFuelLog>(fuelLogsQuery);
  const { data: serviceReminders, isLoading: isLoadingReminders } = useCollection<ServiceReminder>(remindersQuery);
  const { data: trips, isLoading: isLoadingTrips } = useCollection<Trip>(tripsQuery);
  const { data: lastFuelLogResult, isLoading: isLoadingLastLog } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);

  const lastOdometer = lastFuelLogResult?.[0]?.odometer || 0;
  const lastLogForEstimate = fuelLogs?.[0];

  const { avgConsumption } = useMemo(() => {
      if (!fuelLogs) return { avgConsumption: vehicle?.averageConsumptionKmPerLiter || 0 };
      const { avgConsumption } = processFuelLogsForAvg(fuelLogs);
      return { avgConsumption: avgConsumption > 0 ? avgConsumption : vehicle?.averageConsumptionKmPerLiter || 0 };
  }, [fuelLogs, vehicle]);


  useEffect(() => {
    const getEstimate = async () => {
      if (!vehicle || !avgConsumption || !lastLogForEstimate) return;

      setIsLoadingEstimate(true);
      try {
        const currentFuelLevelPercent = lastLogForEstimate?.isFillUp ? 100 : 80;

        const output = await ai.estimateFuelStop({
          vehicleMake: vehicle.make,
          vehicleModel: vehicle.model,
          vehicleYear: vehicle.year,
          fuelCapacityLiters: vehicle.fuelCapacityLiters,
          averageConsumptionKmPerLiter: avgConsumption,
          currentFuelLevelPercent: currentFuelLevelPercent,
          currentOdometer: lastLogForEstimate.odometer,
        });
        setEstimate(output);
      } catch (error) {
        console.error('Error getting fuel estimate:', error);
      } finally {
        setIsLoadingEstimate(false);
      }
    };

    getEstimate();
  }, [vehicle, lastLogForEstimate, avgConsumption]);


  const timelineItems = useMemo((): TimelineHistoryItem[] => {
    if (!fuelLogs && !serviceReminders && !trips) return [];
    if (!dateRange?.from || !dateRange?.to) return [];
    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);

    const combined: TimelineHistoryItem[] = [];

    (fuelLogs || []).forEach(log => {
      const logDate = new Date(log.date);
      if (logDate >= from && logDate <= to) {
        combined.push({ type: 'fuel', sortKey: log.odometer, date: log.date, data: log });
      }
    });

    (serviceReminders || []).forEach(reminder => {
      const targetDate = reminder.isCompleted ? reminder.completedDate : reminder.dueDate;
      if (targetDate) {
        const reminderDate = new Date(targetDate);
        if (reminderDate < from || reminderDate > to) {
          return; // Skip if out of range
        }
      }

      const kmsRemaining = reminder.dueOdometer ? reminder.dueOdometer - lastOdometer : null;
      const daysRemaining = reminder.dueDate ? differenceInDays(new Date(reminder.dueDate), new Date()) : null;
      
      const isOverdue = (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
      const isUrgent = !isOverdue && (
          (kmsRemaining !== null && kmsRemaining <= urgencyThresholdKm) || 
          (daysRemaining !== null && daysRemaining <= urgencyThresholdDays)
      );

      const processedReminder: ProcessedServiceReminder = { ...reminder, kmsRemaining, daysRemaining, isOverdue, isUrgent };
      
      let sortKey: number | null = null;
      let timelineDate: string | null = null;

      if (reminder.isCompleted && reminder.completedOdometer) {
        sortKey = reminder.completedOdometer;
        timelineDate = reminder.completedDate;
      } else if (reminder.dueOdometer) {
        sortKey = reminder.dueOdometer;
        timelineDate = reminder.dueDate; 
      } else if (reminder.dueDate) {
        sortKey = new Date(reminder.dueDate).getTime();
        timelineDate = reminder.dueDate;
      }

      if (sortKey === null && !timelineDate) {
          sortKey = new Date().getTime();
          timelineDate = new Date().toISOString();
      }

      if (sortKey !== null) {
        combined.push({
          type: 'service',
          sortKey: sortKey,
          date: timelineDate || new Date().toISOString(), 
          data: processedReminder,
        });
      }
    });

    (trips || []).forEach(trip => {
      if (trip.status === 'completed' && trip.endDate && trip.endOdometer) {
         const tripDate = new Date(trip.endDate);
         if (tripDate >= from && tripDate <= to) {
            combined.push({ type: 'trip', sortKey: trip.endOdometer, date: trip.endDate, data: trip });
         }
      }
    });

    return combined.sort((a, b) => b.sortKey - a.sortKey);

  }, [fuelLogs, serviceReminders, trips, lastOdometer, urgencyThresholdDays, urgencyThresholdKm, dateRange]);
  
  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }
  
  const isLoading = isLoadingLogs || isLoadingReminders || isLoadingLastLog || isLoadingTrips;
  const lastLogForNewEntry = fuelLogs?.[0];

  return (
     <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
            <div>
                <CardTitle className="font-headline flex items-center gap-2"><History /> Historial del Vehículo</CardTitle>
                <CardDescription>Una línea de tiempo unificada de todas las recargas y servicios para tu {vehicle.make} {vehicle.model}.</CardDescription>
            </div>
            <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
        </div>
      </CardHeader>
      <CardContent>
         {isLoading ? (
             <div className="h-64 text-center flex flex-col items-center justify-center">
                <History className="h-12 w-12 animate-pulse text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">Cargando historial...</p>
            </div>
        ) : (
            <div className='space-y-2'>
              <EstimatedRefuelCard estimate={estimate} isLoading={isLoadingEstimate} />
              {timelineItems.length > 0 ? (
                  <Accordion type="single" collapsible className="w-full">
                    {timelineItems.map((item, index) => (
                      <AccordionItem value={`${item.type}-${'id' in item.data ? item.data.id : index}-${index}`} key={`${item.type}-${'id' in item.data ? item.data.id : index}-${index}`}>
                          {item.type === 'fuel' && <FuelLogItemContent log={item.data as ProcessedFuelLog} vehicle={vehicle as Vehicle} lastLog={lastLogForNewEntry} />}
                          {item.type === 'service' && <ServiceItemContent reminder={item.data as ProcessedServiceReminder} vehicleId={vehicle.id} lastOdometer={lastOdometer} />}
                          {item.type === 'trip' && <TripItemContent trip={item.data as Trip} vehicle={vehicle as Vehicle} allFuelLogs={fuelLogs || []} />}
                      </AccordionItem>
                    ))}
                  </Accordion>
              ) : (
                  <div className="h-64 text-center flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
                      <History className="h-12 w-12 text-muted-foreground" />
                      <p className="mt-4 font-semibold">No hay historial.</p>
                      <p className="text-sm text-muted-foreground">Añade recargas o servicios, o ajusta el filtro de fecha.</p>
                  </div>
              )}
            </div>
        )}
      </CardContent>
    </Card>
  );
}


function FuelLogItemContent({ log, vehicle, lastLog }: { log: ProcessedFuelLog, vehicle: Vehicle, lastLog?: ProcessedFuelLog }) {
  return (
    <>
      <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
        <div className="flex items-center gap-4 w-full">
            <Fuel className="h-8 w-8 flex-shrink-0 text-blue-500/80" />
            <div className="flex-1 min-w-0">
                <p className="font-semibold">{formatDate(log.date)} - Recarga</p>
                <p className="text-sm text-muted-foreground truncate">${log.totalCost.toFixed(2)} por {log.liters.toFixed(2)}L en {log.gasStation}</p>
            </div>
            <div className="text-right">
                <p className="font-semibold">{log.odometer.toLocaleString()} km</p>
                <p className="text-xs text-muted-foreground">Odómetro</p>
            </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-4">
          <div className="space-y-3 pt-4 border-t pl-12">
              <div className="grid grid-cols-2 gap-4 text-sm">
                   <div>
                      <p className="font-medium">${log.pricePerLiter.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Precio/Litro</p>
                   </div>
                   <div>
                      <p className="font-medium">{log.username}</p>
                      <p className="text-xs text-muted-foreground">Conductor</p>
                   </div>
              </div>
              <div className="flex gap-2 pt-4">
                  <AddFuelLogDialog vehicleId={vehicle.id} lastLog={lastLog} fuelLog={log} vehicle={vehicle}>
                      <Button variant="outline" size="sm" className="w-full">
                          <Edit className="h-4 w-4 mr-1" /> Editar
                      </Button>
                  </AddFuelLogDialog>
                  <DeleteFuelLogDialog vehicleId={vehicle.id} fuelLogId={log.id}>
                      <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                      </Button>
                  </DeleteFuelLogDialog>
              </div>
          </div>
      </AccordionContent>
    </>
  )
}

function ServiceItemContent({ reminder, vehicleId, lastOdometer }: { reminder: ProcessedServiceReminder, vehicleId: string, lastOdometer: number }) {
  const { isCompleted, isOverdue, isUrgent } = reminder;

  const getServiceStatusText = () => {
    if (isCompleted) {
      return { text: `Completado el ${formatDate(reminder.completedDate!)}`, icon: <CheckCircle2 className="h-8 w-8 flex-shrink-0 text-green-600" /> };
    }
    if (isOverdue) {
      return { text: 'Servicio Vencido', icon: <Wrench className="h-8 w-8 flex-shrink-0 text-destructive" /> };
    }
    if (isUrgent) {
      return { text: 'Servicio Urgente', icon: <Wrench className="h-8 w-8 flex-shrink-0 text-amber-600" /> };
    }
    return { text: 'Próximo Servicio', icon: <Wrench className="h-8 w-8 flex-shrink-0 text-muted-foreground" /> };
  };

  const status = getServiceStatusText();

  return (
     <>
      <AccordionTrigger className={cn("px-6 py-4 text-left hover:no-underline", {
        "bg-destructive/10 border-destructive/50": !isCompleted && isOverdue,
        "bg-amber-500/10 border-amber-500/50": !isCompleted && isUrgent,
      })}>
        <div className="flex items-center gap-4 w-full">
            {status.icon}
            <div className="flex-1 min-w-0">
                <p className="font-semibold">{status.text}</p>
                <p className="text-sm text-muted-foreground truncate">{reminder.serviceType}</p>
            </div>
            { (reminder.dueOdometer || reminder.completedOdometer) && (
              <div className="text-right">
                  <p className="font-semibold">
                    {(reminder.isCompleted ? reminder.completedOdometer : reminder.dueOdometer)?.toLocaleString()} km
                  </p>
                  <p className="text-xs text-muted-foreground">{isCompleted ? 'Completado a los' : 'Vence a los'}</p>
              </div>
            )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-4">
          <div className="space-y-3 pt-4 border-t pl-12">
               {isCompleted ? (
                 <div className="space-y-2 text-sm">
                    {reminder.cost && <div className="flex justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground"><DollarSign className="h-4 w-4" /> Costo</span>
                        <span>${reminder.cost.toFixed(2)}</span>
                    </div>}
                    {reminder.serviceLocation && <div className="flex justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground"><Building className="h-4 w-4" /> Lugar</span>
                        <span className="truncate max-w-[150px] text-right">{reminder.serviceLocation}</span>
                    </div>}
                 </div>
              ) : (
                 <div className="space-y-2 text-sm">
                    {reminder.dueDate && <div className="flex justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" /> Fecha Límite</span>
                        <span>{formatDate(reminder.dueDate)}</span>
                    </div>}
                    <div className={cn('flex justify-between font-medium', { 'text-destructive': isOverdue, 'text-amber-600': isUrgent })}>
                        <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Estado</span>
                        <span>
                            {reminder.kmsRemaining !== null && reminder.kmsRemaining < 0 
                                ? `Vencido ${Math.abs(reminder.kmsRemaining).toLocaleString()} km`
                                : reminder.kmsRemaining !== null ? `Faltan ${reminder.kmsRemaining.toLocaleString()} km` : ''
                            }
                            {(reminder.kmsRemaining !== null && reminder.daysRemaining !== null) && ' / '}
                            {reminder.daysRemaining !== null && reminder.daysRemaining < 0
                                ? `Vencido ${Math.abs(reminder.daysRemaining)} días`
                                : reminder.daysRemaining !== null ? `Faltan ${reminder.daysRemaining} días` : ''
                            }
                        </span>
                    </div>

                    {reminder.notes && <p className="text-muted-foreground italic pt-2">{reminder.notes}</p>}
                 </div>
              )}
              <div className="flex gap-2 pt-4">
                  <AddServiceReminderDialog vehicleId={vehicleId} reminder={reminder} lastOdometer={lastOdometer}>
                      <Button variant="outline" size="sm" className="w-full">
                          <Edit className="h-4 w-4 mr-1" /> {isCompleted ? 'Ver/Editar' : 'Completar/Editar'}
                      </Button>
                  </AddServiceReminderDialog>
                  <DeleteServiceReminderDialog vehicleId={vehicleId} reminderId={reminder.id}>
                      <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                      </Button>
                  </DeleteServiceReminderDialog>
              </div>
          </div>
      </AccordionContent>
    </>
  )
}

function TripItemContent({ trip, vehicle, allFuelLogs }: { trip: Trip, vehicle: Vehicle, allFuelLogs: ProcessedFuelLog[] }) {
    const { getFormattedConsumption, consumptionUnit } = usePreferences();
    
    const tripCalculations = useMemo(() => {
        if (!trip.endOdometer || !trip.startOdometer) {
            return { kmTraveled: 0, fuelConsumed: 0, totalCost: 0, avgConsumptionForTrip: 0, costPerKm: 0, duration: "N/A" };
        }
        const kmTraveled = trip.endOdometer - trip.startOdometer;
        if (kmTraveled <= 0) {
            return { kmTraveled: 0, fuelConsumed: 0, totalCost: 0, avgConsumptionForTrip: 0, costPerKm: 0, duration: "N/A" };
        }

        const otherExpenses = (trip.expenses || []).reduce((acc, expense) => acc + expense.amount, 0);

        const sortedLogs = [...allFuelLogs].sort((a, b) => a.odometer - b.odometer);
        const logsInTrip = sortedLogs.filter(log => log.odometer > trip.startOdometer! && log.odometer < trip.endOdometer!);
        const keyOdometerPoints = [trip.startOdometer, ...logsInTrip.map(l => l.odometer), trip.endOdometer];
        let totalFuel = 0;
        let fuelCost = 0;
        const fallbackConsumption = vehicle.averageConsumptionKmPerLiter > 0 ? vehicle.averageConsumptionKmPerLiter : 1;
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
        return { kmTraveled, fuelConsumed: totalFuel, totalCost, avgConsumptionForTrip: finalAvgConsumption, costPerKm, duration, otherExpenses };
    }, [trip, allFuelLogs, vehicle.averageConsumptionKmPerLiter]);

    const { kmTraveled, fuelConsumed, totalCost, avgConsumptionForTrip, costPerKm, duration, otherExpenses } = tripCalculations;
    const lastOdometer = trip.endOdometer || 0;

  return (
    <>
      <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
        <div className="flex items-center gap-4 w-full">
          <Map className="h-8 w-8 flex-shrink-0 text-purple-500/80" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{formatDate(trip.endDate!)} - Viaje a {trip.destination}</p>
            <p className="text-sm text-muted-foreground truncate">{trip.tripType}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{kmTraveled.toLocaleString()} km</p>
            <p className="text-xs text-muted-foreground">Distancia</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-4">
        <div className="space-y-3 pt-4 border-t pl-12">
           <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6 text-sm">
                <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">${totalCost.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Costo Total Viaje</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{fuelConsumed.toFixed(2)} L</p>
                        <p className="text-xs text-muted-foreground">Combustible (Est.)</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{getFormattedConsumption(avgConsumptionForTrip)}</p>
                        <p className="text-xs text-muted-foreground">Consumo ({consumptionUnit})</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                     <Clock className="h-4 w-4 text-muted-foreground" />
                     <div>
                        <p className="font-medium">{duration}</p>
                        <p className="text-xs text-muted-foreground">Duración</p>
                     </div>
                </div>
                <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                    <div>
                        <p className="font-medium">{trip.username}</p>
                        <p className="text-xs text-muted-foreground">Conductor</p>
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
                    <p className="font-medium">Otros Gastos (${otherExpenses.toFixed(2)}):</p>
                     <ul className="text-muted-foreground list-disc pl-5 mt-1">
                        {trip.expenses.map((expense, index) => (
                            <li key={index} className="flex justify-between">
                                <span>{expense.description}</span>
                                <span>${expense.amount.toFixed(2)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
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
      </AccordionContent>
    </>
  )
}
