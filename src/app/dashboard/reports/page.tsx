'use client';

import { useState, useMemo, useEffect } from 'react';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import type { ProcessedFuelLog, ServiceReminder, Vehicle } from '@/lib/types';
import { DateRange } from 'react-day-picker';
import { subDays, startOfDay, endOfDay, getYear, getMonth } from 'date-fns';
import { DateRangePicker } from '@/components/reports/date-range-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Car, Fuel, Wrench, Gauge, Calendar, DollarSign, Route, TrendingUp, Droplets, AlertTriangle, Loader2 } from 'lucide-react';
import { ReportStatCard } from '@/components/reports/report-stat-card';
import { EvolutionChart } from '@/components/reports/evolution-chart';
import FuelConsumptionChart from '@/components/dashboard/fuel-consumption-chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonthlyCostsChart } from '@/components/reports/monthly-costs-chart';
import { MonthlyDistanceChart } from '@/components/reports/monthly-distance-chart';
import { formatCurrency } from '@/lib/utils';
import { getDolarBlueRate } from '@/ai/flows/get-exchange-rate';
import { calculateCostsPerKm, calculateTotalCostInARS } from '@/lib/cost-calculator';
import { useToast } from '@/hooks/use-toast';


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
    return { ...log, distanceTraveled: log.odometer - prevLog.odometer };
  });
  return calculatedLogs;
}

export default function ReportsPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(true);

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
  
  useEffect(() => {
    const fetchRate = async () => {
      try {
        setIsLoadingRate(true);
        const rate = await getDolarBlueRate();
        setExchangeRate(rate.average);
        toast({
            title: 'Cotización Obtenida',
            description: `Dólar (Promedio): ${formatCurrency(rate.average)}`,
        });
      } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error al obtener cotización',
            description: 'No se pudo obtener el valor del dólar automáticamente. Los costos totales no estarán disponibles.',
        });
      } finally {
        setIsLoadingRate(false);
      }
    };
    fetchRate();
  }, [toast]);

  const { availableYears, annualData } = useMemo(() => {
    if (!allFuelLogsData) return { availableYears: [], annualData: null };
    
    const years = new Set<string>();
    allFuelLogsData.forEach(log => years.add(String(getYear(new Date(log.date)))));
    const sortedYears = Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    
    const year = parseInt(selectedYear);
    
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      name: new Date(year, i).toLocaleString('es-ES', { month: 'short' }),
      combustible: 0,
      servicios: 0,
      total: 0,
      km: 0,
    }));

    // Calculate costs
    allFuelLogsData
      .filter(log => getYear(new Date(log.date)) === year)
      .forEach(log => {
        const month = getMonth(new Date(log.date));
        monthlyData[month].combustible += log.totalCost;
      });

    allServicesData
      ?.filter(service => service.isCompleted && service.completedDate && getYear(new Date(service.completedDate)) === year)
      .forEach(service => {
        const month = getMonth(new Date(service.completedDate!));
        monthlyData[month].servicios += service.cost || 0;
      });
      
    // Calculate distance
    const logsForYear = allFuelLogsData.filter(log => getYear(new Date(log.date)) === year);
    for (let i = 0; i < 12; i++) {
        const logsInMonth = logsForYear.filter(log => getMonth(new Date(log.date)) === i);
        if (logsInMonth.length > 1) {
            const firstOdo = logsInMonth[0].odometer;
            const lastOdo = logsInMonth[logsInMonth.length - 1].odometer;
            monthlyData[i].km = lastOdo - firstOdo;
        }
    }


    monthlyData.forEach(month => month.total = month.combustible + month.servicios);

    return { availableYears: sortedYears, annualData: monthlyData };
  }, [allFuelLogsData, allServicesData, selectedYear]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);


  const reportData = useMemo(() => {
    if (!vehicle || !allFuelLogsData || !allServicesData) {
      return null;
    }
    
    // --- GLOBAL COST PER KM CALCULATION ---
    const lastFuelLog = allFuelLogsData.length > 0 ? allFuelLogsData[allFuelLogsData.length - 1] : null;
    const avgConsumption = vehicle.averageConsumptionKmPerLiter || 0;
    const lastFuelPrice = lastFuelLog?.pricePerLiter || 0;

    const costsPerKm = calculateCostsPerKm(vehicle, avgConsumption, lastFuelPrice);
    const totalCostPerKm_ARS = exchangeRate ? calculateTotalCostInARS(costsPerKm, exchangeRate) : null;
    
    // --- PERIOD-SPECIFIC CALCULATIONS ---
     if (!dateRange?.from || !dateRange?.to) {
        return { empty: true, fuelCostPerKm: costsPerKm.fuelCostPerKm, totalCostPerKm: totalCostPerKm_ARS };
     }

    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);

    const logsInPeriod = allFuelLogsData.filter(log => {
        const logDate = new Date(log.date);
        return logDate >= from && logDate <= to;
    });
    
    const fuelLogs = processFuelLogs(logsInPeriod);
    
    if (fuelLogs.length === 0) {
        return { empty: true, fuelCostPerKm: costsPerKm.fuelCostPerKm, totalCostPerKm: totalCostPerKm_ARS };
    }
    
    const consumptionLogs = fuelLogs.filter(log => log.consumption && log.consumption > 0);
    const periodAvgConsumption = consumptionLogs.length > 0 ? consumptionLogs.reduce((sum, log) => sum + log.consumption!, 0) / consumptionLogs.length : 0;

    return {
      empty: false,
      fuelCostPerKm: costsPerKm.fuelCostPerKm,
      totalCostPerKm: totalCostPerKm_ARS,
      periodFuelLogs: fuelLogs,
      periodAvgConsumption
    };
  }, [dateRange, vehicle, allFuelLogsData, allServicesData, exchangeRate]);

  if (!vehicle) {
    return <div className="text-center p-8">Por favor, seleccione un vehículo para ver los informes.</div>;
  }
  
  const isLoading = isLoadingLogs || isLoadingServices || isLoadingRate;
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-headline text-3xl flex items-center gap-2"><BarChart /> Informes del Vehículo</h1>
          <p className="text-muted-foreground">Analiza el rendimiento y los costos de tu {vehicle.make} {vehicle.model}.</p>
        </div>
      </div>
      
       {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
            <BarChart className="h-12 w-12 animate-pulse" />
            <p className="mt-4">Generando informes...</p>
        </div>
      ) : !allFuelLogsData || allFuelLogsData.length === 0 ? (
         <div className="h-64 flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <AlertTriangle className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 font-semibold">No hay datos suficientes.</p>
            <p className="text-sm text-muted-foreground">Añade al menos un registro de combustible para empezar.</p>
        </div>
      ) : (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><DollarSign /> Costos por Kilómetro</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <ReportStatCard icon={Fuel} title="Costo Combustible / km (ARS)" value={formatCurrency(reportData?.fuelCostPerKm || 0)} description="Costo variable de combustible por kilómetro."/>
                   <ReportStatCard icon={Car} title="Costo Total Real / km (ARS)" value={reportData?.totalCostPerKm ? formatCurrency(reportData.totalCostPerKm) : 'N/A'} description="Incluye combustible, amortización y costos fijos."/>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <CardTitle className="flex items-center gap-2"><Calendar /> Resumen Anual</CardTitle>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Seleccionar año" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableYears.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <MonthlyCostsChart data={annualData} />
                    <MonthlyDistanceChart data={annualData} />
                </CardContent>
            </Card>

            <Card>
                 <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <CardTitle className="flex items-center gap-2"><TrendingUp /> Análisis por Período</CardTitle>
                        <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
                    </div>
                </CardHeader>
                <CardContent>
                    {!reportData || reportData.empty ? (
                         <div className="h-64 flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
                            <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                            <p className="mt-4 font-semibold">No hay datos en este período.</p>
                            <p className="text-sm text-muted-foreground">Ajusta el rango de fechas para ver datos.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <FuelConsumptionChart data={reportData.periodFuelLogs} />
                                <EvolutionChart 
                                title="Evolución del Consumo (Rendimiento)" 
                                data={reportData.periodFuelLogs.filter(log => log.consumption && log.consumption > 0)}
                                dataKey="date"
                                valueKey="consumption"
                                valueFormatter={(val) => `${val.toFixed(2)} km/L`}
                                tooltipLabel="Rendimiento"
                                icon={TrendingUp}
                                />
                                <EvolutionChart 
                                title="Evolución del Precio del Combustible" 
                                data={reportData.periodFuelLogs}
                                dataKey="date"
                                valueKey="pricePerLiter"
                                valueFormatter={(val) => `${formatCurrency(val)} / L`}
                                tooltipLabel="Precio/L"
                                icon={Droplets}
                                />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
      )}
    </div>
  );
}
