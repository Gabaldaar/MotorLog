'use client';

import type { ProcessedFuelLog } from '@/lib/types';
import { useVehicles } from '@/context/vehicle-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { formatDate } from '@/lib/utils';
import AddFuelLogDialog from '@/components/dashboard/add-fuel-log-dialog';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Gauge, Droplets, Tag, Building, User as UserIcon } from 'lucide-react';
import DeleteFuelLogDialog from '@/components/dashboard/delete-fuel-log-dialog';

function processFuelLogs(logs: ProcessedFuelLog[]): ProcessedFuelLog[] {
  // Sort logs by date ascending to calculate consumption correctly
  const sortedLogsAsc = logs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const calculatedLogs = sortedLogsAsc.map((log, index) => {
    if (index === 0) return { ...log };
    
    const prevLog = sortedLogsAsc[index - 1];
    
    const distanceTraveled = log.odometer - prevLog.odometer;
    // Only calculate consumption if the previous log was a fill-up
    if (prevLog && prevLog.isFillUp) {
      const consumption = distanceTraveled > 0 && log.liters > 0 ? distanceTraveled / log.liters : 0;
      return {
        ...log,
        distanceTraveled,
        consumption: parseFloat(consumption.toFixed(2)),
      };
    }
    
    return { ...log, distanceTraveled };
  });

  // Return logs sorted descending for display
  return calculatedLogs.reverse();
}


export default function LogsPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();

  const fuelLogsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'users', user.uid, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('date', 'desc')
    );
  }, [firestore, user, vehicle]);

  const { data: fuelLogs, isLoading } = useCollection<ProcessedFuelLog>(fuelLogsQuery);
  
  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }

  const processedLogs = fuelLogs ? processFuelLogs(fuelLogs) : [];
  const lastLog = processedLogs?.[0]; // Already sorted desc

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle className="font-headline">Registros de Combustible</CardTitle>
            <CardDescription>Un historial completo de todos tus repostajes.</CardDescription>
        </div>
        <AddFuelLogDialog vehicleId={vehicle.id} lastLog={lastLog} />
      </CardHeader>
      <CardContent>
        {/* Desktop Table View */}
        <div className="hidden md:block">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Odómetro</TableHead>
                <TableHead>Litros</TableHead>
                <TableHead>Llenado</TableHead>
                <TableHead>Costo Total</TableHead>
                <TableHead>$/Litro</TableHead>
                <TableHead>Km/L</TableHead>
                <TableHead>Gasolinera</TableHead>
                <TableHead>Conductor</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading ? (
                    <TableRow><TableCell colSpan={10} className="h-24 text-center">Cargando registros...</TableCell></TableRow>
                ) : processedLogs.length > 0 ? (
                processedLogs.map((log) => (
                    <TableRow key={log.id}>
                    <TableCell>{formatDate(log.date)}</TableCell>
                    <TableCell>{log.odometer.toLocaleString()} km</TableCell>
                    <TableCell>{log.liters.toFixed(2)} L</TableCell>
                    <TableCell>
                        {log.isFillUp && <Badge variant="secondary">Sí</Badge>}
                    </TableCell>
                    <TableCell>${log.totalCost.toFixed(2)}</TableCell>
                    <TableCell>${log.pricePerLiter.toFixed(2)}</TableCell>
                    <TableCell>{log.consumption ? `${log.consumption.toFixed(2)}` : 'N/A'}</TableCell>
                    <TableCell>{log.gasStation}</TableCell>
                    <TableCell>{log.username}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                        <AddFuelLogDialog vehicleId={vehicle.id} lastLog={lastLog} fuelLog={log}>
                            <Button variant="ghost" size="icon">
                                <Edit className="h-4 w-4" />
                            </Button>
                        </AddFuelLogDialog>
                        <DeleteFuelLogDialog vehicleId={vehicle.id} fuelLogId={log.id}>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </DeleteFuelLogDialog>
                        </div>
                    </TableCell>
                    </TableRow>
                ))
                ) : (
                <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center">
                    No hay registros de combustible para este vehículo.
                    </TableCell>
                </TableRow>
                )}
            </TableBody>
            </Table>
        </div>

        {/* Mobile Accordion View */}
        <div className="md:hidden">
            {isLoading ? (
                 <div className="h-24 text-center flex items-center justify-center">Cargando registros...</div>
            ) : processedLogs.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                    {processedLogs.map(log => (
                        <AccordionItem value={log.id} key={log.id}>
                            <AccordionTrigger className="flex justify-between items-center w-full p-4 hover:no-underline">
                                <div className="flex-1 text-left">
                                    <p className="font-semibold">{formatDate(log.date)}</p>
                                    <p className="text-sm text-muted-foreground">{log.liters.toFixed(2)}L por ${log.totalCost.toFixed(2)}</p>
                                </div>
                                {log.isFillUp && <Badge variant="secondary" className="ml-4">Lleno</Badge>}
                            </AccordionTrigger>
                            <AccordionContent className="p-4 pt-0">
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="flex items-center gap-2 text-muted-foreground"><Gauge className="h-4 w-4" /> Odómetro</span>
                                        <span>{log.odometer.toLocaleString()} km</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="flex items-center gap-2 text-muted-foreground"><Droplets className="h-4 w-4" /> Km/L</span>
                                        <span>{log.consumption ? `${log.consumption.toFixed(2)}` : 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4" /> $/Litro</span>
                                        <span>${log.pricePerLiter.toFixed(2)}</span>
                                    </div>
                                    {log.gasStation && (
                                        <div className="flex justify-between">
                                            <span className="flex items-center gap-2 text-muted-foreground"><Building className="h-4 w-4" /> Gasolinera</span>
                                            <span>{log.gasStation}</span>
                                        </div>
                                    )}
                                    {log.username && (
                                        <div className="flex justify-between">
                                            <span className="flex items-center gap-2 text-muted-foreground"><UserIcon className="h-4 w-4" /> Conductor</span>
                                            <span>{log.username}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-end gap-2 pt-2">
                                        <AddFuelLogDialog vehicleId={vehicle.id} lastLog={lastLog} fuelLog={log}>
                                            <Button variant="outline" size="sm">
                                                <Edit className="h-4 w-4 mr-1" /> Editar
                                            </Button>
                                        </AddFuelLogDialog>
                                        <DeleteFuelLogDialog vehicleId={vehicle.id} fuelLogId={log.id}>
                                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                                                <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                                            </Button>
                                        </DeleteFuelLogDialog>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <div className="h-24 text-center flex items-center justify-center">No hay registros de combustible para este vehículo.</div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
