'use client';

import { useState, useMemo, useEffect } from 'react';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import type { ProcessedFuelLog, ServiceReminder, Vehicle } from '@/lib/types';
import { DateRange } from 'react-day-picker';
import { subDays, startOfDay, endOfDay, differenceInDays } from 'date-fns';
import { DateRangePicker } from '@/components/reports/date-range-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Car, Fuel, Wrench, Gauge, Calendar, DollarSign, Route, TrendingUp, Droplets, AlertTriangle } from 'lucide-react';
import { ReportStatCard } from '@/components/reports/report-stat-card';
import { EvolutionChart } from '@/components/reports/evolution-chart';
import FuelConsumptionChart from '@/components/dashboard/fuel-consumption-chart';

function processFuelLogs(logs: ProcessedFuelLog[]): ProcessedFuelLog[] {
  const sortedLogsAsc = logs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const calculatedLogs = sortedLogsAsc.map((log, index) => {
    if (index === 0) return { ...log };
    const prevLog = sortedLogsAsc[index - 1];
    if (prevLog && prevLog.isFillUp && !log.missedPreviousFillUp) {
      const distanceTraveled = log.odometer - prevLog.odometer;
      const consumption = distanceTraveled > 0 && log.liters > 0 ? distanceTraveled / log.liters : 0;
      return { ...log, distanceTraveled, consumption: parseFloat(consumption.toFixed(2)) };
    }
    return { ...log };
  });
  return calculatedLogs;
}

export default function ReportsPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  const allFuelLogsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('date', 'asc')
    );
  }, [firestore, user, vehicle]);

  const allServicesQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'service_reminders'),
      orderBy('completedDate', 'asc')
    );
  }, [firestore, user, vehicle]);

  const { data: allFuelLogsData, isLoading: isLoadingLogs } = useCollection<ProcessedFuelLog>(allFuelLogsQuery);
  const { data: allServicesData, isLoading: isLoadingServices } = useCollection<ServiceReminder>(allServicesQuery);

  const reportData = useMemo(() => {
    if (!vehicle || !allFuelLogsData || !allServicesData || !dateRange?.from || !dateRange?.to) {
      return null;
    }

    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);

    const fuelLogs = processFuelLogs(allFuelLogsData).filter(log => {
      const logDate = new Date(log.date);
      return logDate >= from && logDate <= to;
    });

    const services = allServicesData.filter(service => {
      if (!service.isCompleted || !service.completedDate) return false;
      const serviceDate = new Date(service.completedDate);
      return serviceDate >= from && serviceDate <= to;
    });

    if (fuelLogs.length === 0) return { empty: true };

    const totalFuelCost = fuelLogs.reduce((acc, log) => acc + log.totalCost, 0);
    const totalServiceCost = services.reduce((acc, service) => acc + (service.cost || 0), 0);
    const totalCost = totalFuelCost + totalServiceCost;

    const firstLog = fuelLogs[0];
    const lastLog = fuelLogs[fuelLogs.length - 1];
    const kmTraveled = lastLog.odometer - firstLog.odometer;

    const periodDays = Math.max(differenceInDays(to, from) + 1, 1);
    
    const costPerKm = kmTraveled > 0 ? totalCost / kmTraveled : 0;
    const fuelCostPerKm = kmTraveled > 0 ? totalFuelCost / kmTraveled : 0;
    const serviceCostPerKm = kmTraveled > 0 ? totalServiceCost / kmTraveled : 0;

    const costPerDay = totalCost / periodDays;
    const fuelCostPerDay = totalFuelCost / periodDays;
    const serviceCostPerDay = totalServiceCost / periodDays;

    const consumptionLogs = fuelLogs.filter(log => log.consumption && log.consumption > 0);
    const avgConsumption = consumptionLogs.length > 0 ? consumptionLogs.reduce((sum, log) => sum + log.consumption!, 0) / consumptionLogs.length : 0;
    const minConsumption = consumptionLogs.length > 0 ? Math.min(...consumptionLogs.map(log => log.consumption!)) : 0;
    const maxConsumption = consumptionLogs.length > 0 ? Math.max(...consumptionLogs.map(log => log.consumption!)) : 0;
    
    const kmPerDay = kmTraveled / periodDays;

    const avgAutonomy = avgConsumption > 0 ? avgConsumption * vehicle.fuelCapacityLiters : 0;
    
    const fillUpLogs = fuelLogs.filter(log => log.isFillUp);
    let totalDistanceBetweenFillUps = 0;
    let fillUpIntervals = 0;
    for (let i = 1; i < fillUpLogs.length; i++) {
        const distance = fillUpLogs[i].odometer - fillUpLogs[i-1].odometer;
        if(distance > 0) {
            totalDistanceBetweenFillUps += distance;
            fillUpIntervals++;
        }
    }
    const avgKmBetweenFillUps = fillUpIntervals > 0 ? totalDistanceBetweenFillUps / fillUpIntervals : 0;

    return {
      totalCost, totalFuelCost, totalServiceCost, kmTraveled,
      costPerKm, fuelCostPerKm, serviceCostPerKm,
      costPerDay, fuelCostPerDay, serviceCostPerDay,
      avgConsumption, minConsumption, maxConsumption,
      kmPerDay, fuelLogs, avgAutonomy, avgKmBetweenFillUps, empty: false,
    };
  }, [dateRange, vehicle, allFuelLogsData, allServicesData]);

  if (!vehicle) {
    return <div className="text-center p-8">Por favor, seleccione un vehículo para ver los informes.</div>;
  }
  
  const isLoading = isLoadingLogs || isLoadingServices;

  const toLitersPer100Km = (kmPerLiter: number) => kmPerLiter > 0 ? (100 / kmPerLiter) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-headline text-3xl flex items-center gap-2"><BarChart /> Informes del Vehículo</h1>
          <p className="text-muted-foreground">Analiza el rendimiento y los costos de tu {vehicle.make} {vehicle.model}.</p>
        </div>
        <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
      </div>

      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
            <BarChart className="h-12 w-12 animate-pulse" />
            <p className="mt-4">Generando informes...</p>
        </div>
      ) : !reportData || reportData.empty ? (
        <div className="h-64 flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <AlertTriangle className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 font-semibold">No hay datos suficientes.</p>
            <p className="text-sm text-muted-foreground">No se encontraron registros en el período seleccionado.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* General Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReportStatCard icon={DollarSign} title="Costo Total" value={`$${reportData.totalCost.toFixed(2)}`} />
            <ReportStatCard icon={Fuel} title="Gasto en Combustible" value={`$${reportData.totalFuelCost.toFixed(2)}`} />
            <ReportStatCard icon={Wrench} title="Gasto en Servicios" value={`$${reportData.totalServiceCost.toFixed(2)}`} />
            <ReportStatCard icon={Route} title="Distancia Recorrida" value={`${reportData.kmTraveled.toLocaleString()} km`} />
          </div>

          {/* Cost Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign/> Análisis de Costos</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <ReportStatCard icon={Fuel} title="Costo Combustible / km" value={`$${reportData.fuelCostPerKm.toFixed(3)}`} variant="small" />
              <ReportStatCard icon={Wrench} title="Costo Servicios / km" value={`$${reportData.serviceCostPerKm.toFixed(3)}`} variant="small" />
              <ReportStatCard icon={Car} title="Costo Total / km" value={`$${reportData.costPerKm.toFixed(3)}`} variant="small" />
              <ReportStatCard icon={Fuel} title="Costo Combustible / día" value={`$${reportData.fuelCostPerDay.toFixed(2)}`} variant="small" />
              <ReportStatCard icon={Wrench} title="Costo Servicios / día" value={`$${reportData.serviceCostPerDay.toFixed(2)}`} variant="small" />
              <ReportStatCard icon={Calendar} title="Costo Total / día" value={`$${reportData.costPerDay.toFixed(2)}`} variant="small" />
            </CardContent>
          </Card>
          
          {/* Consumption Analysis */}
           <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Gauge/> Análisis de Consumo y Distancia</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <ReportStatCard title="Autonomía Promedio" value={`${reportData.avgAutonomy.toFixed(0)} km`} description="con tanque lleno" variant="small" />
                <ReportStatCard title="Km Promedio / Recarga" value={`${reportData.avgKmBetweenFillUps.toFixed(0)} km`} description="entre tanques llenos" variant="small" />
                <ReportStatCard title="Consumo Promedio" value={`${reportData.avgConsumption.toFixed(2)} km/L`} description={`${toLitersPer100Km(reportData.avgConsumption).toFixed(2)} L/100km`} variant="small" />
                <ReportStatCard title="Consumo Mínimo (Mejor)" value={`${reportData.maxConsumption.toFixed(2)} km/L`} description={`${toLitersPer100Km(reportData.maxConsumption).toFixed(2)} L/100km`} variant="small" />
                <ReportStatCard title="Consumo Máximo (Peor)" value={`${reportData.minConsumption.toFixed(2)} km/L`} description={`${toLitersPer100Km(reportData.minConsumption).toFixed(2)} L/100km`} variant="small" />
                <ReportStatCard title="Distancia Promedio / día" value={`${reportData.kmPerDay.toFixed(1)} km`} variant="small" />
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FuelConsumptionChart data={reportData.fuelLogs} />
            <EvolutionChart 
              title="Evolución del Consumo (Rendimiento)" 
              data={reportData.fuelLogs.filter(log => log.consumption && log.consumption > 0)}
              dataKey="date"
              valueKey="consumption"
              valueFormatter={(val) => `${val.toFixed(2)} km/L`}
              tooltipLabel="Rendimiento"
              icon={TrendingUp}
            />
            <EvolutionChart 
              title="Evolución del Precio del Combustible" 
              data={reportData.fuelLogs}
              dataKey="date"
              valueKey="pricePerLiter"
              valueFormatter={(val) => `$${val.toFixed(2)} / L`}
              tooltipLabel="Precio/L"
              icon={Droplets}
            />
          </div>

        </div>
      )}
    </div>
  );
}
