
'use client';

import type { ServiceReminder, ProcessedFuelLog } from '@/lib/types';
import { useVehicles } from '@/context/vehicle-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Wrench, Calendar, Gauge, Edit, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import AddServiceReminderDialog from '@/components/dashboard/add-service-reminder-dialog';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import DeleteServiceReminderDialog from '@/components/dashboard/delete-service-reminder-dialog';
import { cn } from '@/lib/utils';
import CompleteServiceDialog from '@/components/dashboard/complete-service-dialog';

export default function ServicesPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();

  const remindersQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
        collection(firestore, 'vehicles', vehicle.id, 'service_reminders'),
        orderBy('dueDate', 'desc') // Order by desc to show newest first
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

  const { data: reminders, isLoading } = useCollection<ServiceReminder>(remindersQuery);
  const { data: lastFuelLog, isLoading: isLoadingLastLog } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);

  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }

  const lastOdometer = lastFuelLog?.[0]?.odometer || 0;
  
  // Sort reminders: pending (most urgent first) then completed (most recent first)
  const sortedReminders = (reminders || []).sort((a, b) => {
    if (a.isCompleted && !b.isCompleted) return 1;
    if (!a.isCompleted && b.isCompleted) return -1;
    
    if (!a.isCompleted && !b.isCompleted) {
       // Urgency logic for pending reminders
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;
      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aDate - bDate;
    }
    
    // Sort completed reminders by completed date
    const aDate = a.completedDate ? new Date(a.completedDate).getTime() : 0;
    const bDate = b.completedDate ? new Date(b.completedDate).getTime() : 0;
    return bDate - aDate;
  });
  
  const getKmsRemaining = (dueOdometer: number) => {
    if (!lastOdometer || !dueOdometer) return null;
    return dueOdometer - lastOdometer;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle className="font-headline">Servicios y Mantenimiento</CardTitle>
            <CardDescription>Gestiona los recordatorios de servicio para tu {vehicle.make} {vehicle.model}.</CardDescription>
        </div>
        <AddServiceReminderDialog vehicleId={vehicle.id}>
            <Button>
                <Plus className='-ml-1 mr-2 h-4 w-4' />
                Añadir Recordatorio
            </Button>
        </AddServiceReminderDialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
            {(isLoading || isLoadingLastLog) ? (
                <div className="flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed">
                    <Wrench className="h-12 w-12 text-muted-foreground animate-pulse" />
                    <p className="mt-4 text-muted-foreground">Cargando recordatorios...</p>
                </div>
            ) : sortedReminders.length > 0 ? (
                sortedReminders.map((reminder: ServiceReminder) => {
                  const kmsRemaining = reminder.dueOdometer ? getKmsRemaining(reminder.dueOdometer) : null;
                  return (
                    <div key={reminder.id} className={cn("flex items-start gap-4 rounded-lg border p-4 transition-colors", {
                      "bg-muted/30": reminder.isCompleted,
                      "border-destructive/50 bg-destructive/5": !reminder.isCompleted && kmsRemaining !== null && kmsRemaining < 0,
                    })}>
                        <div className="flex-shrink-0 pt-1">
                            {reminder.isCompleted ? (
                              <CheckCircle2 className="h-6 w-6 text-green-600" />
                            ) : (
                              <Wrench className="h-6 w-6 text-muted-foreground" />
                            )}
                        </div>
                        <div className={cn("flex-1", { "opacity-60": reminder.isCompleted })}>
                            <div className="flex justify-between items-center">
                                <p className={cn("font-semibold text-lg", { "line-through": reminder.isCompleted })}>
                                  {reminder.serviceType}
                                </p>
                                {reminder.isUrgent && !reminder.isCompleted && <Badge variant="destructive">Urgente</Badge>}
                            </div>
                            <p className="text-muted-foreground mt-1">{reminder.notes}</p>
                            
                             {reminder.isCompleted ? (
                                <div className="text-sm text-muted-foreground flex flex-col items-start gap-y-2 mt-3">
                                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                    {reminder.completedDate && (
                                      <span className='flex items-center gap-1.5'>
                                          <Calendar className="h-4 w-4" />
                                          Completado el {formatDate(reminder.completedDate)}
                                      </span>
                                    )}
                                    {reminder.completedOdometer && (
                                      <span className='flex items-center gap-1.5'>
                                          <Gauge className="h-4 w-4" />
                                          a los {reminder.completedOdometer.toLocaleString()} km
                                      </span>
                                    )}
                                    {reminder.serviceLocation && (
                                      <span className='flex items-center gap-1.5'>
                                          <Wrench className="h-4 w-4" />
                                          en {reminder.serviceLocation}
                                      </span>
                                    )}
                                  </div>
                                  {reminder.dueOdometer && (
                                    <p className="text-xs italic mt-1">
                                      (Programado originalmente para los {reminder.dueOdometer.toLocaleString()} km)
                                    </p>
                                  )}
                                </div>
                            ) : (
                              <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
                                  {reminder.dueDate && (
                                  <span className='flex items-center gap-1.5'>
                                      <Calendar className="h-4 w-4" />
                                      {formatDate(reminder.dueDate)}
                                  </span>
                                  )}
                                  {reminder.dueOdometer && (
                                  <span className='flex items-center gap-1.5'>
                                      <Gauge className="h-4 w-4" />
                                      {reminder.dueOdometer.toLocaleString()} km
                                  </span>
                                  )}
                                  {kmsRemaining !== null && (
                                    <span className={`flex items-center gap-1.5 font-medium ${kmsRemaining < 0 ? 'text-destructive' : 'text-amber-600'}`}>
                                      <AlertTriangle className="h-4 w-4" />
                                      {kmsRemaining < 0 
                                        ? `Vencido hace ${Math.abs(kmsRemaining).toLocaleString()} km`
                                        : `Faltan ${kmsRemaining.toLocaleString()} km`
                                      }
                                    </span>
                                  )}
                              </div>
                            )}
                        </div>
                        <div className='flex items-center gap-2'>
                              {!reminder.isCompleted && (
                                  <CompleteServiceDialog vehicleId={vehicle.id} reminder={reminder} lastOdometer={lastOdometer} />
                              )}
                              <AddServiceReminderDialog vehicleId={vehicle.id} reminder={reminder}>
                                  <Button variant="outline" size="icon">
                                      <Edit className="h-4 w-4" />
                                      <span className="sr-only">Editar</span>
                                  </Button>
                              </AddServiceReminderDialog>
                             <DeleteServiceReminderDialog vehicleId={vehicle.id} reminderId={reminder.id} />
                        </div>
                    </div>
                  )
                })
            ) : (
              <div className="flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed">
                <Wrench className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">No hay recordatorios de servicio.</p>
              </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
