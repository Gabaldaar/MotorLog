
'use client';

import type { ProcessedFuelLog, ServiceReminder, TimelineItem } from '@/lib/types';
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
  CheckCircle2
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useMemo } from 'react';
import AddFuelLogDialog from '@/components/dashboard/add-fuel-log-dialog';
import DeleteFuelLogDialog from '@/components/dashboard/delete-fuel-log-dialog';
import AddServiceReminderDialog from '@/components/dashboard/add-service-reminder-dialog';
import DeleteServiceReminderDialog from '@/components/dashboard/delete-service-reminder-dialog';


export default function HistoryPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();

  const fuelLogsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('date', 'desc')
    );
  }, [firestore, user, vehicle]);

  const remindersQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'service_reminders'),
      orderBy('date', 'desc')
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
  const { data: lastFuelLog, isLoading: isLoadingLastLog } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);

  const timelineItems = useMemo((): TimelineItem[] => {
    if (!fuelLogs && !serviceReminders) return [];

    const combined: TimelineItem[] = [];

    (fuelLogs || []).forEach(log => {
      combined.push({
        type: 'fuel',
        date: log.date,
        data: log
      });
    });

    (serviceReminders || []).forEach(reminder => {
      // For the timeline, we prioritize the completion date. If not completed, use the due date.
      const timelineDate = reminder.completedDate || reminder.dueDate;
      if (timelineDate) {
        combined.push({
          type: 'service',
          date: timelineDate,
          data: reminder
        });
      }
    });

    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  }, [fuelLogs, serviceReminders]);
  
  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }
  
  const isLoading = isLoadingLogs || isLoadingReminders || isLoadingLastLog;
  const lastOdometer = lastFuelLog?.[0]?.odometer || 0;
  const lastLogForNewEntry = fuelLogs?.[0]; // Already sorted desc

  return (
     <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2"><History /> Historial del Vehículo</CardTitle>
        <CardDescription>Una línea de tiempo unificada de todos los repostajes y servicios para tu {vehicle.make} {vehicle.model}.</CardDescription>
      </CardHeader>
      <CardContent>
         {isLoading ? (
             <div className="h-64 text-center flex flex-col items-center justify-center">
                <History className="h-12 w-12 animate-pulse text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">Cargando historial...</p>
            </div>
        ) : timelineItems.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {timelineItems.map((item, index) => (
                <AccordionItem value={`${item.type}-${'id' in item.data ? item.data.id : index}`} key={`${item.type}-${'id' in item.data ? item.data.id : index}`}>
                    {item.type === 'fuel' ? (
                      <FuelLogItemContent log={item.data as ProcessedFuelLog} vehicle={vehicle} lastLog={lastLogForNewEntry} />
                    ) : (
                      <ServiceItemContent reminder={item.data as ServiceReminder} vehicleId={vehicle.id} lastOdometer={lastOdometer}/>
                    )}
                </AccordionItem>
              ))}
            </Accordion>
        ) : (
             <div className="h-64 text-center flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
                <History className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 font-semibold">No hay historial.</p>
                <p className="text-sm text-muted-foreground">Añade repostajes o servicios para empezar a construir la línea de tiempo.</p>
            </div>
        )}
      </CardContent>
    </Card>
  );
}


function FuelLogItemContent({ log, vehicle, lastLog }: { log: ProcessedFuelLog, vehicle: any, lastLog?: ProcessedFuelLog }) {
  return (
    <>
      <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
        <div className="flex items-center gap-4">
            <Fuel className="h-8 w-8 flex-shrink-0 text-blue-500/80" />
            <div className="flex-1">
                <p className="font-semibold">{formatDate(log.date)} - Repostaje</p>
                <p className="text-sm text-muted-foreground">${log.totalCost.toFixed(2)} por {log.liters.toFixed(2)}L en {log.gasStation}</p>
            </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-4">
          <div className="space-y-3 pt-4 border-t pl-12">
              <div className="grid grid-cols-2 gap-4 text-sm">
                   <div>
                      <p className="font-medium">{log.odometer.toLocaleString()} km</p>
                      <p className="text-xs text-muted-foreground">Odómetro</p>
                   </div>
                   <div>
                      <p className="font-medium">${log.pricePerLiter.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Precio/Litro</p>
                   </div>
              </div>
              <div className="flex justify-between text-sm items-center">
                  <span className="flex items-center gap-2 text-muted-foreground"><UserIcon className="h-4 w-4" /> Conductor</span>
                  <span>{log.username}</span>
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

function ServiceItemContent({ reminder, vehicleId, lastOdometer }: { reminder: ServiceReminder, vehicleId: string, lastOdometer: number }) {
  return (
     <>
      <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
        <div className="flex items-center gap-4">
            {reminder.isCompleted ? <CheckCircle2 className="h-8 w-8 flex-shrink-0 text-green-600" /> : <Wrench className="h-8 w-8 flex-shrink-0 text-amber-500/80" />}
            <div className="flex-1">
                <p className="font-semibold">{formatDate(reminder.date)} - {reminder.isCompleted ? 'Servicio Completado' : 'Recordatorio de Servicio'}</p>
                <p className="text-sm text-muted-foreground">{reminder.serviceType}</p>
            </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-4">
          <div className="space-y-3 pt-4 border-t pl-12">
               {reminder.isCompleted ? (
                 <div className="space-y-2 text-sm">
                    {reminder.completedOdometer && <div className="flex justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground"><Gauge className="h-4 w-4" /> Odómetro</span>
                        <span>{reminder.completedOdometer.toLocaleString()} km</span>
                    </div>}
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
                    {reminder.dueOdometer && <div className="flex justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground"><Gauge className="h-4 w-4" /> Odómetro Límite</span>
                        <span>{reminder.dueOdometer.toLocaleString()} km</span>
                    </div>}
                    {reminder.notes && <p className="text-muted-foreground italic pt-2">{reminder.notes}</p>}
                 </div>
              )}
              <div className="flex gap-2 pt-4">
                  <AddServiceReminderDialog vehicleId={vehicleId} reminder={reminder} lastOdometer={lastOdometer}>
                      <Button variant="outline" size="sm" className="w-full">
                          <Edit className="h-4 w-4 mr-1" /> {reminder.isCompleted ? 'Ver/Editar' : 'Completar/Editar'}
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

    