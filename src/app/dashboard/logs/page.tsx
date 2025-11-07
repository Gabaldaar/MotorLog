
'use client';

import { useMemo, useState, Fragment } from 'react';
import type { ProcessedFuelLog, Vehicle } from '@/lib/types';
import { useVehicles } from '@/context/vehicle-context';
import { formatDate, formatCurrency } from '@/lib/utils';
import AddFuelLogDialog from '@/components/dashboard/add-fuel-log-dialog';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Gauge, Droplets, Tag, Building, User as UserIcon, Plus, Fuel, AlertTriangle, Loader2 } from 'lucide-react';
import DeleteFuelLogDialog from '@/components/dashboard/delete-fuel-log-dialog';
import { usePreferences } from '@/context/preferences-context';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { DateRangePicker } from '@/components/reports/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import EstimatedRefuelCard from '@/components/dashboard/estimated-refuel-card';

function processFuelLogs(logs: ProcessedFuelLog[]): ProcessedFuelLog[] {
  // Sort logs by odometer ascending to calculate consumption correctly
  const sortedLogsAsc = [...logs].sort((a, b) => a.odometer - b.odometer);

  const calculatedLogs = sortedLogsAsc.map((log, index) => {
    if (index === 0) return { ...log };
    
    const prevLog = sortedLogsAsc[index - 1];
    
    const distanceTraveled = log.odometer - prevLog.odometer;
    
    // Only calculate consumption if the previous log was a fill-up
    // and the current log is NOT marked as having a missed previous fill-up.
    if (prevLog && prevLog.isFillUp && !log.missedPreviousFillUp) {
      const consumption = distanceTraveled > 0 && log.liters > 0 ? distanceTraveled / log.liters : 0;
      return {
        ...log,
        distanceTraveled,
        consumption: parseFloat(consumption.toFixed(2)),
      };
    }
    
    return { ...log, distanceTraveled };
  });

  // Return logs sorted descending for display (by date, which is the original query order)
  return calculatedLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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


export default function LogsPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { consumptionUnit, getFormattedConsumption } = usePreferences();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const allFuelLogsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('date', 'desc')
    );
  }, [firestore, user, vehicle]);

  const { data: allFuelLogs, isLoading } = useCollection<ProcessedFuelLog>(allFuelLogsQuery);
  
  const processedLogs = useMemo(() => {
    if (!allFuelLogs) return [];
    return processFuelLogs([...allFuelLogs]);
  }, [allFuelLogs]);
  
  const filteredLogs = useMemo(() => {
    if (!processedLogs) return [];
    if (!dateRange?.from || !dateRange?.to) return processedLogs;

    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);
    return processedLogs.filter(log => {
      const logDate = new Date(log.date);
      return logDate >= from && logDate <= to;
    });
  }, [processedLogs, dateRange]);

  const avgConsumption = useMemo(() => {
    if (!vehicle || !allFuelLogs) return 0;
    const consumptionLogs = processFuelLogs(allFuelLogs).filter(log => log.consumption && log.consumption > 0);
    return consumptionLogs.length > 0
      ? consumptionLogs.reduce((acc, log) => acc + (log.consumption || 0), 0) / consumptionLogs.length
      : vehicle.averageConsumptionKmPerLiter || 0;
  }, [allFuelLogs, vehicle]);

  const vehicleWithAvgConsumption = useMemo(() => {
    if (!vehicle) return null;
    return { ...vehicle, averageConsumptionKmPerLiter: avgConsumption };
  }, [vehicle, avgConsumption]);

  const lastLog = processedLogs?.[0]; // Already sorted desc

  if (isLoading || !vehicle || !vehicleWithAvgConsumption) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
       <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
              <h1 className="font-headline text-3xl">Registros de Combustible</h1>
              <p className="text-muted-foreground">Un historial completo de todas tus recargas.</p>
          </div>
           <div className="flex flex-col sm:flex-row gap-2">
            <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
            <AddFuelLogDialog vehicleId={vehicle.id} lastLog={lastLog} vehicle={vehicle as Vehicle}>
                <Button>
                <Plus className="-ml-1 mr-2 h-4 w-4" />
                Añadir Recarga
                </Button>
            </AddFuelLogDialog>
          </div>
        </div>
        
        <EstimatedRefuelCard vehicle={vehicleWithAvgConsumption} allFuelLogs={allFuelLogs || []} />

        {isLoading ? (
             <div className="h-64 text-center flex flex-col items-center justify-center">
                <Fuel className="h-12 w-12 animate-pulse text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">Cargando registros...</p>
            </div>
        ) : filteredLogs.length > 0 ? (
            <Card>
              <Accordion type="single" collapsible className="w-full">
                  {filteredLogs.map(log => (
                      <Fragment key={log.id}>
                        <AccordionItem value={log.id}>
                            <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                              <div className="flex items-center gap-4 w-full">
                                  <Fuel className="h-8 w-8 flex-shrink-0 text-primary/80" />
                                  <div className="flex-1 flex flex-col sm:flex-row sm:justify-between sm:items-center">
                                      <div className="flex-1 min-w-0">
                                          <p className="font-semibold">{formatDate(log.date)}</p>
                                          <div className="flex items-center gap-2 mt-1">
                                              {log.missedPreviousFillUp ? (
                                                  <Badge variant="destructive">Anterior omitida</Badge>
                                              ) : log.isFillUp ? (
                                                  <Badge variant="secondary">Lleno</Badge>
                                              ) : (
                                                  <Badge className="bg-amber-500/80 text-white">Parcial</Badge>
                                              )}
                                              <p className="text-sm text-muted-foreground sm:hidden truncate">{formatCurrency(log.totalCost)} por {log.liters.toFixed(2)}L</p>
                                          </div>
                                      </div>
                                      <div className="hidden sm:flex items-center gap-6 text-sm text-right ml-4">
                                          <div className="flex-1">
                                              <p>{formatCurrency(log.totalCost)}</p>
                                              <p className="text-muted-foreground text-xs">{log.liters.toFixed(2)} L</p>
                                          </div>
                                          <div className="w-24">
                                              <p>{getFormattedConsumption(log.consumption)}</p>
                                              <p className="text-muted-foreground text-xs">{consumptionUnit}</p>
                                          </div>
                                          <div className="w-24">
                                              <p>{log.odometer.toLocaleString()} km</p>
                                              <p className="text-muted-foreground text-xs">Odómetro</p>
                                          </div>
                                      </div>
                                  </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-6 pb-4">
                                <div className="space-y-3 pt-4 border-t pl-12">
                                    <div className="sm:hidden grid grid-cols-2 gap-4 text-sm">
                                         <div>
                                            <p className="font-medium">{getFormattedConsumption(log.consumption)}</p>
                                            <p className="text-xs text-muted-foreground">{consumptionUnit}</p>
                                         </div>
                                         <div>
                                            <p className="font-medium">{log.odometer.toLocaleString()} km</p>
                                            <p className="text-xs text-muted-foreground">Odómetro</p>
                                         </div>
                                    </div>
                                    <div className="flex justify-between text-sm items-center">
                                        <span className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4" /> Precio/Litro</span>
                                        <span>{formatCurrency(log.pricePerLiter)}</span>
                                    </div>
                                    {log.gasStation && (
                                        <div className="flex justify-between text-sm items-center">
                                            <span className="flex items-center gap-2 text-muted-foreground"><Building className="h-4 w-4" /> Gasolinera</span>
                                            <span className="truncate max-w-[150px] text-right">{log.gasStation}</span>
                                        </div>
                                    )}
                                    {log.username && (
                                        <div className="flex justify-between text-sm items-center">
                                            <span className="flex items-center gap-2 text-muted-foreground"><UserIcon className="h-4 w-4" /> Conductor</span>
                                            <span>{log.username}</span>
                                        </div>
                                    )}
                                    <div className="flex gap-2 pt-4">
                                        <AddFuelLogDialog vehicleId={vehicle.id} lastLog={lastLog} fuelLog={log} vehicle={vehicle as Vehicle}>
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
                        </AccordionItem>
                        {log.missedPreviousFillUp && <MissedLogPlaceholder />}
                      </Fragment>
                  ))}
              </Accordion>
            </Card>
        ) : (
             <div className="h-64 text-center flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
                <Fuel className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 font-semibold">No hay registros de combustible.</p>
                <p className="text-sm text-muted-foreground">Añade tu primera recarga para empezar o ajusta el filtro de fecha.</p>
            </div>
        )}
    </div>
  );
}
