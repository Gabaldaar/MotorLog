
'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
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
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import AddFuelLogDialog from '@/components/dashboard/add-fuel-log-dialog';
import DeleteFuelLogDialog from '@/components/dashboard/delete-fuel-log-dialog';
import AddServiceReminderDialog from '@/components/dashboard/add-service-reminder-dialog';
import DeleteServiceReminderDialog from '@/components/dashboard/delete-service-reminder-dialog';
import { usePreferences } from '@/context/preferences-context';
import { differenceInDays, differenceInHours, differenceInMinutes, startOfDay, endOfDay, subDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import AddTripDialog from '@/components/dashboard/add-trip-dialog';
import { DateRangePicker } from '@/components/reports/date-range-picker';
import type { DateRange } from 'react-day-picker';
import EstimatedRefuelCard from '@/components/dashboard/estimated-refuel-card';
import { Loader2 } from 'lucide-react';
import { processFuelLogs } from '@/lib/vehicle-calculations';
import { TripDetails } from '@/components/trips/completed-trips';

type TimelineHistoryItem = {
    type: 'fuel' | 'service' | 'trip' | 'missed-log';
    sortKey: number; // Odometer or timestamp
    date: string;
    data: ProcessedFuelLog | ProcessedServiceReminder | Trip | {};
};


export default function HistoryPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { urgencyThresholdDays, urgencyThresholdKm } = usePreferences();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [avgConsumption, setAvgConsumption] = useState(vehicle?.averageConsumptionKmPerLiter || 0);

  const allFuelLogsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('date', 'desc')
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
      orderBy('startDate', 'desc')
    );
  }, [firestore, user, vehicle]);
  
  const { data: allFuelLogs, isLoading: isLoadingLogs } = useCollection<ProcessedFuelLog>(allFuelLogsQuery);
  const { data: serviceReminders, isLoading: isLoadingReminders } = useCollection<ServiceReminder>(remindersQuery);
  const { data: trips, isLoading: isLoadingTrips } = useCollection<Trip>(tripsQuery);

  useEffect(() => {
    if (vehicle && allFuelLogs) {
      const processedLogs = processFuelLogs(allFuelLogs);
      const consumptionLogs = processedLogs.filter(log => log.consumption && log.consumption > 0);
      const calculatedAvg = consumptionLogs.length > 0
        ? consumptionLogs.reduce((acc, log) => acc + (log.consumption || 0), 0) / consumptionLogs.length
        : vehicle.averageConsumptionKmPerLiter || 0;
      setAvgConsumption(calculatedAvg);
    }
  }, [allFuelLogs, vehicle]);

  
  const lastOdometer = useMemo(() => {
    if (!allFuelLogs || allFuelLogs.length === 0) return 0;
    // Find the log with the highest odometer reading
    return Math.max(...allFuelLogs.map(log => log.odometer));
  }, [allFuelLogs]);

  const vehicleWithAvgConsumption = useMemo(() => {
    if (!vehicle) return null;
    return { ...vehicle, averageConsumptionKmPerLiter: avgConsumption };
  }, [vehicle, avgConsumption]);

  const timelineItems = useMemo((): TimelineHistoryItem[] => {
    const combined: TimelineHistoryItem[] = [];

    const from = dateRange?.from ? startOfDay(dateRange.from) : null;
    const to = dateRange?.to ? endOfDay(dateRange.to) : null;

    (allFuelLogs || []).forEach(log => {
      if (!from || !to || (new Date(log.date) >= from && new Date(log.date) <= to)) {
        combined.push({ type: 'fuel', sortKey: log.odometer, date: log.date, data: log });
        if (log.missedPreviousFillUp) {
            combined.push({ type: 'missed-log', sortKey: log.odometer - 1, date: log.date, data: {} });
        }
      }
    });

    (serviceReminders || []).forEach(reminder => {
      const targetDate = reminder.isCompleted ? reminder.completedDate : reminder.dueDate;
      if (from && to && targetDate) {
        const reminderDate = new Date(targetDate);
        if (reminderDate < from || reminderDate > to) {
          return;
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
      if (trip.status === 'completed') {
        const hasStages = trip.stages && trip.stages.length > 0;
        const lastStage = hasStages ? trip.stages[trip.stages.length - 1] : null;
        const endDate = lastStage?.stageEndDate || (trip as any).endDate || trip.startDate;
        const endOdometer = lastStage?.stageEndOdometer || (trip as any).endOdometer || trip.startOdometer;

        if (endDate && (!from || !to || (new Date(endDate) >= from && new Date(endDate) <= to))) {
          combined.push({
            type: 'trip',
            sortKey: endOdometer,
            date: endDate,
            data: trip,
          });
        }
      }
    });

    return combined.sort((a, b) => b.sortKey - a.sortKey);

  }, [allFuelLogs, serviceReminders, trips, lastOdometer, urgencyThresholdDays, urgencyThresholdKm, dateRange]);
    
  const lastLogForNewEntry = allFuelLogs?.[0];

  
  const isLoading = isLoadingLogs || isLoadingReminders || isLoadingTrips;

  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!vehicle || !vehicleWithAvgConsumption) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Historial del Vehículo</CardTitle>
          <CardDescription>Por favor, añade o selecciona un vehículo para ver su historial.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
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
      <CardContent className="space-y-6">
        <EstimatedRefuelCard vehicle={vehicleWithAvgConsumption} allFuelLogs={allFuelLogs || []} />
         {isLoading ? (
             <div className="h-64 text-center flex flex-col items-center justify-center">
                <History className="h-12 w-12 animate-pulse text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">Cargando historial...</p>
            </div>
        ) : (
            <div className='space-y-2'>
              {timelineItems.length > 0 ? (
                  <Accordion type="single" collapsible className="w-full">
                    {timelineItems.map((item, index) => (
                      <Fragment key={`${item.type}-${'id' in item.data ? item.data.id : index}-${item.sortKey}`}>
                        {item.type === 'fuel' && 'id' in item.data && <AccordionItem value={`fuel-${item.data.id}`}><FuelLogItemContent log={item.data as ProcessedFuelLog} vehicle={vehicle as Vehicle} lastLog={lastLogForNewEntry} /></AccordionItem>}
                        {item.type === 'missed-log' && <MissedLogPlaceholder />}
                        {item.type === 'service' && 'id' in item.data && <AccordionItem value={`service-${item.data.id}`}><ServiceItemContent reminder={item.data as ProcessedServiceReminder} vehicleId={vehicle.id} lastOdometer={lastOdometer} /></AccordionItem>}
                        {item.type === 'trip' && 'id' in item.data && <AccordionItem value={`trip-${item.data.id}`}><TripItemContent trip={item.data as Trip} vehicle={vehicle as Vehicle} allFuelLogs={allFuelLogs || []} /></AccordionItem>}
                      </Fragment>
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

function MissedLogPlaceholder() {
    return (
        <Card className="bg-amber-500/10 border-amber-500/50 my-2">
            <CardContent className="p-3">
                <div className="flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="font-semibold text-amber-800 dark:text-amber-200">Registro Omitido</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">Falta un registro de recarga anterior a este punto.</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function FuelLogItemContent({ log, vehicle, lastLog }: { log: ProcessedFuelLog, vehicle: Vehicle, lastLog?: ProcessedFuelLog }) {
  return (
    <>
      <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
        <div className="flex items-center gap-4 w-full">
            <Fuel className="h-8 w-8 flex-shrink-0 text-blue-500/80" />
            <div className="flex-1 min-w-0">
                <p className="font-semibold">{formatDate(log.date)} - Recarga</p>
                <div className="flex items-center gap-2 mt-1">
                    {log.missedPreviousFillUp ? (
                        <Badge variant="destructive">Anterior omitida</Badge>
                    ) : log.isFillUp ? (
                        <Badge variant="secondary">Lleno</Badge>
                    ) : (
                        <Badge className="bg-amber-500/80 text-white">Parcial</Badge>
                    )}
                    <p className="text-sm text-muted-foreground truncate">{formatCurrency(log.totalCost)} por {log.liters.toFixed(2)}L</p>
                </div>
            </div>
            <div className="text-right ml-auto">
                <p className="font-semibold">{log.odometer.toLocaleString()} km</p>
                <p className="text-xs text-muted-foreground">Odómetro</p>
            </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-4">
          <div className="space-y-3 pt-4 border-t pl-12">
              <div className="grid grid-cols-2 gap-4 text-sm">
                   <div>
                      <p className="font-medium">{formatCurrency(log.pricePerLiter)}</p>
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
                        <span>{formatCurrency(reminder.cost)}</span>
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
  const getTripSummary = (t: Trip) => {
    if (!t.stages || t.stages.length === 0) {
      // @ts-ignore - Support for legacy trips without stages
      const distance = (t as any).endOdometer ? (t as any).endOdometer - t.startOdometer : 0;
      // @ts-ignore
      const endDate = (t as any).endDate || t.startDate;
      return { distance: Math.max(0, distance), endDate };
    }
    const lastStage = t.stages[t.stages.length - 1];
    const distance = Math.max(0, lastStage.stageEndOdometer - t.startOdometer);
    const endDate = lastStage.stageEndDate;
    return { distance, endDate };
  };

  const summary = getTripSummary(trip);

  return (
    <>
      <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
        <div className="flex items-center gap-4 w-full">
          <Map className="h-8 w-8 flex-shrink-0 text-purple-500/80" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{trip.tripType}: {trip.destination}</p>
            <p className="text-sm text-muted-foreground truncate">
              {summary.endDate ? `Finalizado el ${formatDateTime(summary.endDate)}` : `Iniciado el ${formatDateTime(trip.startDate)}`}
            </p>
          </div>
          <div className="text-right ml-auto">
            <p className="font-semibold">{summary.distance.toLocaleString()} km</p>
            <p className="text-xs text-muted-foreground">Distancia Total</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-4">
        <TripDetails trip={trip} vehicle={vehicle} allFuelLogs={allFuelLogs} />
      </AccordionContent>
    </>
  );
}

    
