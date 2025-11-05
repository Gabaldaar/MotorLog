import type { Metadata } from 'next';
import { vehicles, serviceReminders } from '@/lib/data';
import type { Vehicle, ServiceReminder } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Wrench, Calendar, Gauge } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Servicios y Mantenimiento - FuelWise',
};

export default function ServicesPage({
  searchParams,
}: {
  searchParams?: { vehicle?: string };
}) {
  const currentVehicleId = searchParams?.vehicle || vehicles[0]?.id || '';
  const vehicle = vehicles.find(v => v.id === currentVehicleId) as Vehicle | undefined;
  
  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }

  const vehicleServiceReminders = serviceReminders
    .filter((reminder) => reminder.vehicleId === vehicle.id)
    .sort((a, b) => (a.isUrgent ? -1 : 1));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle className="font-headline">Servicios y Mantenimiento</CardTitle>
            <CardDescription>Gestiona los recordatorios de servicio para tu {vehicle.make} {vehicle.model}.</CardDescription>
        </div>
        <Button>
            <Plus className='-ml-1 mr-2 h-4 w-4' />
            Añadir Recordatorio
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
            {vehicleServiceReminders.length > 0 ? (
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
                         <Button variant="outline" size="sm">Completar</Button>
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
