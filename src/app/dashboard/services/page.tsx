'use client';

import type { ServiceReminder } from '@/lib/types';
import { useVehicles } from '@/context/vehicle-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Wrench, Calendar, Gauge, Edit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';
import AddServiceReminderDialog from '@/components/dashboard/add-service-reminder-dialog';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';

export default function ServicesPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const remindersQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
        collection(firestore, 'vehicles', vehicle.id, 'service_reminders'),
        orderBy('dueDate', 'asc')
    );
  }, [firestore, user, vehicle]);

  const { data: reminders, isLoading } = useCollection<ServiceReminder>(remindersQuery);
  
  const handleReminderDelete = (reminderId: string) => {
    if (!user || !vehicle) return;
    const reminderRef = doc(firestore, 'vehicles', vehicle.id, 'service_reminders', reminderId);
    deleteDocumentNonBlocking(reminderRef);
    toast({
        title: "Recordatorio Completado",
        description: "El recordatorio de servicio ha sido marcado como completado."
    })
  };
  
  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }
  
  const vehicleServiceReminders = (reminders || [])
    .filter(r => r.dueDate)
    .sort((a, b) => (a.isUrgent === b.isUrgent ? 0 : a.isUrgent ? -1 : 1));

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
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed">
                    <Wrench className="h-12 w-12 text-muted-foreground animate-pulse" />
                    <p className="mt-4 text-muted-foreground">Cargando recordatorios...</p>
                </div>
            ) : vehicleServiceReminders.length > 0 ? (
                vehicleServiceReminders.map((reminder: ServiceReminder) => (
                    <div key={reminder.id} className="flex items-start gap-4 rounded-lg border p-4">
                        <div className="flex-shrink-0 pt-1">
                            <Wrench className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-center">
                                <p className="font-semibold text-lg">{reminder.serviceType}</p>
                                {reminder.isUrgent && <Badge variant="destructive">Urgente</Badge>}
                            </div>
                            <p className="text-muted-foreground mt-1">{reminder.notes}</p>
                            <div className="text-sm text-muted-foreground flex items-center gap-6 mt-2">
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
                            </div>
                        </div>
                        <div className='flex items-center gap-2'>
                             <AddServiceReminderDialog vehicleId={vehicle.id} reminder={reminder}>
                                <Button variant="outline" size="icon">
                                    <Edit className="h-4 w-4" />
                                    <span className="sr-only">Editar</span>
                                </Button>
                             </AddServiceReminderDialog>
                             <Button variant="outline" size="sm" onClick={() => handleReminderDelete(reminder.id)}>Completar</Button>
                        </div>
                    </div>
                ))
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
