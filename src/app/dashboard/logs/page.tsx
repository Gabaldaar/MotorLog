import type { Metadata } from 'next';
import { vehicles, fuelLogs } from '@/lib/data';
import type { ProcessedFuelLog, Vehicle } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import AddFuelLogDialog from '@/components/dashboard/add-fuel-log-dialog';

export const metadata: Metadata = {
  title: 'Registros de Combustible - FuelWise',
};

function processFuelLogs(logs: typeof fuelLogs, vehicleId: string): ProcessedFuelLog[] {
  const vehicleLogs = logs
    .filter(log => log.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return vehicleLogs.map((log, index, allLogs) => {
    const prevLog = allLogs[index + 1];
    if (!prevLog) return { ...log };

    const distanceTraveled = log.odometer - prevLog.odometer;
    const consumption = distanceTraveled > 0 && log.liters > 0 ? distanceTraveled / log.liters : 0;
    
    return {
      ...log,
      distanceTraveled,
      consumption: parseFloat(consumption.toFixed(2)),
    };
  });
}

export default function LogsPage({
  searchParams,
}: {
  searchParams?: { vehicle?: string };
}) {
  const currentVehicleId = searchParams?.vehicle || vehicles[0]?.id || '';
  const vehicle = vehicles.find(v => v.id === currentVehicleId) as Vehicle | undefined;
  
  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }

  const processedLogs = processFuelLogs(fuelLogs, vehicle.id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle className="font-headline">Registros de Combustible</CardTitle>
            <CardDescription>Un historial completo de todos tus repostajes.</CardDescription>
        </div>
        <AddFuelLogDialog vehicleId={vehicle.id} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Odómetro</TableHead>
              <TableHead>Litros</TableHead>
              <TableHead>Costo Total</TableHead>
              <TableHead>$/Litro</TableHead>
              <TableHead>Km/L</TableHead>
              <TableHead>Gasolinera</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedLogs.length > 0 ? (
              processedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{formatDate(log.date)}</TableCell>
                  <TableCell>{log.odometer.toLocaleString()} km</TableCell>
                  <TableCell>{log.liters.toFixed(2)} L</TableCell>
                  <TableCell>${log.totalCost.toFixed(2)}</TableCell>
                  <TableCell>${log.pricePerLiter.toFixed(2)}</TableCell>
                  <TableCell>{log.consumption ? `${log.consumption.toFixed(2)}` : 'N/A'}</TableCell>
                  <TableCell>{log.gasStation}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No hay registros de combustible para este vehículo.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
