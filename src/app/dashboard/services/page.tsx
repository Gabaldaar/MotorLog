
'use client';

import type { ServiceReminder, ProcessedFuelLog } from '@/lib/types';
import { useVehicles } from '@/context/vehicle-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Wrench, Calendar, Gauge, Edit, AlertTriangle, CheckCircle2, Repeat, DollarSign, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import AddServiceReminderDialog from '@/components/dashboard/add-service-reminder-dialog';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import DeleteServiceReminderDialog from '@/components/dashboard/delete-service-reminder-dialog';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/context/preferences-context';
import { differenceInDays } from 'date-fns';

export default function ServicesPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { urgencyThresholdDays, urgencyThresholdKm } = usePreferences();


  const remindersQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
        collection(firestore, 'vehicles', vehicle.id, 'service_reminders'),
        orderBy('dueDate', 'desc')
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
  
  const getKmsRemaining = (dueOdometer: number | null) => {
    if (!lastOdometer || !dueOdometer) return null;
    return dueOdometer - lastOdometer;
  }

  const getDaysRemaining = (dueDate: string | null) => {
    if (!dueDate) return null;
    return differenceInDays(new Date(dueDate), new Date());
  }
  
  const sortedReminders = [...(reminders || [])].map(r => {
    const kmsRemaining = getKmsRemaining(r.dueOdometer);
    const daysRemaining = getDaysRemaining(r.dueDate);
    
    const isOverdue = (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
    const isUrgent = !isOverdue && (
        (kmsRemaining !== null && kmsRemaining <= urgencyThresholdKm) || 
        (daysRemaining !== null && daysRemaining <= urgencyThresholdDays)
    );

    return {...r, kmsRemaining, daysRemaining, isOverdue, isUrgent };
  }).sort((a, b) => {
    if (a.isCompleted && !b.isCompleted) return 1;
    if (!a.isCompleted && b.isCompleted) return -1;
    
    // Both are pending
    if (!a.isCompleted && !b.isCompleted) {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;

      const aUrgency = a.dueOdometer ? a.dueOdometer - lastOdometer : Infinity;
      const bUrgency = b.dueOdometer ? b.dueOdometer - lastOdometer : Infinity;
      
      if (a.dueOdometer && b.dueOdometer) return aUrgency - bUrgency;
      
      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aDate - bDate;
    }
    
    // Both are completed, sort by most recent completed date
    const aDate = a.completedDate ? new Date(a.completedDate).getTime() : 0;
    const bDate = b.completedDate ? new Date(b.completedDate).getTime() : 0;
    return bDate - aDate;
  });
  
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <CardTitle className="font-headline">Servicios y Mantenimiento</CardTitle>
            <CardDescription>Gestiona los recordatorios de servicio para tu {vehicle.make} {vehicle.model}.</CardDescription>
        </div>
        <AddServiceReminderDialog vehicleId={vehicle.id} lastOdometer={lastOdometer}>
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
                sortedReminders.map((reminder) => {
                  return (
                    <div key={reminder.id} className={cn("flex items-start gap-4 rounded-lg border p-4 transition-colors", {
                      "bg-muted/30": reminder.isCompleted,
                      "border-destructive/50 bg-destructive/10": !reminder.isCompleted && reminder.isOverdue,
                      "border-amber-500/50 bg-amber-500/10": !reminder.isCompleted && reminder.isUrgent,
                    })}>
                        <div className="flex-shrink-0 pt-1">
                            {reminder.isCompleted ? (
                              <CheckCircle2 className="h-6 w-6 text-green-600" />
                            ) : (
                              <Wrench className={cn("h-6 w-6", {
                                  "text-destructive": reminder.isOverdue,
                                  "text-amber-600": reminder.isUrgent,
                                  "text-muted-foreground": !reminder.isOverdue && !reminder.isUrgent
                              })} />
                            )}
                        </div>
                        <div className={cn("flex-1 grid gap-y-2 min-w-0", { "opacity-60": reminder.isCompleted })}>
                            <div className="flex justify-between items-start gap-4">
                                <p className={cn("font-semibold text-lg break-words", { "line-through": reminder.isCompleted })}>
                                  {reminder.serviceType}
                                </p>
                                <div className="flex-shrink-0 flex flex-col sm:flex-row items-end sm:items-center gap-2">
                                  {!reminder.isCompleted && reminder.isOverdue && <Badge variant="destructive">Vencido</Badge>}
                                  {!reminder.isCompleted && reminder.isUrgent && <Badge className="bg-amber-500 hover:bg-amber-500/80 text-white">Urgente</Badge>}
                                  {reminder.isRecurring && !reminder.isCompleted && <Badge variant="outline" className="flex items-center gap-1"><Repeat className="h-3 w-3"/> Recurrente</Badge>}
                                </div>
                            </div>

                            <p className="text-muted-foreground text-sm mt-1">{reminder.notes}</p>
                            
                             {reminder.isCompleted ? (
                                <div className="text-sm text-muted-foreground flex flex-col items-start gap-y-2 mt-2">
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
                                    {reminder.cost && (
                                       <span className='flex items-center gap-1.5'>
                                          <DollarSign className="h-4 w-4" />
                                          Costo: ${reminder.cost.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                   <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                     {reminder.serviceLocation && (
                                      <span className='flex items-center gap-1.5'>
                                          <Wrench className="h-4 w-4" />
                                          en {reminder.serviceLocation}
                                      </span>
                                    )}
                                  </div>
                                  {(reminder.dueOdometer || reminder.isRecurring) && (
                                    <p className="text-xs italic mt-1">
                                      {reminder.isRecurring && `Servicio recurrente cada ${reminder.recurrenceIntervalKm?.toLocaleString()} km. `}
                                      {reminder.dueOdometer && `(Próximo a los ${reminder.dueOdometer.toLocaleString()} km)`}
                                    </p>
                                  )}
                                </div>
                            ) : (
                              <div className="text-sm text-muted-foreground flex flex-col items-start gap-y-2 gap-x-6 mt-2">
                                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                    {reminder.dueDate && (
                                    <span className='flex items-center gap-1.5'>
                                        <Calendar className="h-4 w-4" />
                                        Vence el {formatDate(reminder.dueDate)}
                                    </span>
                                    )}
                                    {reminder.dueOdometer && (
                                    <span className='flex items-center gap-1.5'>
                                        <Gauge className="h-4 w-4" />
                                        Vence a los {reminder.dueOdometer.toLocaleString()} km
                                    </span>
                                    )}
                                  </div>
                                  
                                  <div className={cn('flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 font-medium', {
                                    'text-destructive': reminder.isOverdue,
                                    'text-amber-600': reminder.isUrgent,
                                    'text-muted-foreground/80': !reminder.isOverdue && !reminder.isUrgent
                                  })}>
                                    <div className="flex items-center gap-1.5">
                                      <AlertTriangle className="h-4 w-4" />
                                      {reminder.kmsRemaining !== null && reminder.kmsRemaining < 0 
                                        ? `Vencido hace ${Math.abs(reminder.kmsRemaining).toLocaleString()} km`
                                        : reminder.kmsRemaining !== null ? `Faltan ${reminder.kmsRemaining.toLocaleString()} km` : ''
                                      }
                                    </div>
                                    <span className="hidden sm:block">
                                       {(reminder.kmsRemaining !== null && reminder.daysRemaining !== null) && '/'}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      {reminder.daysRemaining !== null && <AlertTriangle className="h-4 w-4 sm:hidden" />}
                                      {reminder.daysRemaining !== null && reminder.daysRemaining < 0 
                                        ? `Vencido hace ${Math.abs(reminder.daysRemaining)} días`
                                        : reminder.daysRemaining !== null ? `Faltan ${reminder.daysRemaining} días` : ''
                                      }
                                    </div>
                                  </div>
                              </div>
                            )}

                            <div className="flex items-center gap-2 pt-4 border-t w-full mt-2">
                                <AddServiceReminderDialog vehicleId={vehicle.id} reminder={reminder} lastOdometer={lastOdometer}>
                                <Button variant="outline" size="sm" className="w-full">
                                    <Edit className="h-4 w-4 mr-1" /> Editar
                                </Button>
                                </AddServiceReminderDialog>
                                <DeleteServiceReminderDialog vehicleId={vehicle.id} reminderId={reminder.id}>
                                <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive">
                                    <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                                </Button>
                                </DeleteServiceReminderDialog>
                            </div>
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
