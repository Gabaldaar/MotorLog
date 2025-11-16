
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import type { ProcessedFuelLog, ServiceReminder, Vehicle } from '@/lib/types';
import { DateRange } from 'react-day-picker';
import { subDays, startOfDay, endOfDay, differenceInDays, getYear, getMonth } from 'date-fns';
import { DateRangePicker } from '@/components/reports/date-range-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Car, Fuel, Wrench, Gauge, Calendar, DollarSign, Route, TrendingUp, Droplets, AlertTriangle, TrendingDown } from 'lucide-react';
import { ReportStatCard } from '@/components/reports/report-stat-card';
import { EvolutionChart } from '@/components/reports/evolution-chart';
import FuelConsumptionChart from '@/components/dashboard/fuel-consumption-chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonthlyCostsChart } from '@/components/reports/monthly-costs-chart';
import { MonthlyDistanceChart } from '@/components/reports/monthly-distance-chart';
import { formatCurrency } from '@/lib/utils';


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
  
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

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
    if (!vehicle || !allFuelLogsData || !allServicesData || !dateRange?.from || !dateRange?.to) {
      return null;
    }

    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);

    const logsInPeriod = allFuelLogsData.filter(log => {
        const logDate = new Date(log.date);
        return logDate >= from && logDate <= to;
    });

    const servicesInPeriod = allServicesData.filter(service => {
        if (!service.isCompleted || !service.completedDate) return false;
        const serviceDate = new Date(service.completedDate);
        return serviceDate >= from && serviceDate <= to;
    });
    
    // Fallback logic for missing exchange rates
    const validRates = [...logsInPeriod, ...servicesInPeriod]
        .map(item => item.exchangeRate)
        .filter((rate): rate is number => typeof rate === 'number' && rate > 0);
    
    const avgExchangeRate = validRates.length > 0 ? validRates.reduce((sum, rate) => sum + rate, 0) / validRates.length : 0;

    const fuelLogs = processFuelLogs(logsInPeriod).map(log => {
        if (log.totalCostUsd === undefined && avgExchangeRate > 0) {
            return { ...log, totalCostUsd: log.totalCost / avgExchangeRate };
        }
        return log;
    });

    const services = servicesInPeriod.map(service => {
        if (service.costUsd === undefined && avgExchangeRate > 0 && service.cost) {
            return { ...service, costUsd: service.cost / avgExchangeRate };
        }
        return service;
    });


    // --- Fixed Costs & Amortization Calculation ---
    const periodDays = Math.max(differenceInDays(to, from) + 1, 1);
    let dailyDepreciation = 0;
    if (vehicle.purchasePrice && vehicle.purchasePrice > 0) {
      const usefulLifeYears = 10;
      dailyDepreciation = vehicle.purchasePrice / (usefulLifeYears * 365);
    }
    const dailyInsurance = (vehicle.annualInsuranceCost || 0) / 365;
    const dailyPatent = (vehicle.annualPatentCost || 0) / 365;
    const dailyFixedCost = dailyDepreciation + dailyInsurance + dailyPatent;
    const totalFixedCostInPeriod = dailyFixedCost * periodDays;


    // --- Operative Costs Calculation (in both currencies) ---
    const totalFuelCostARS = fuelLogs.reduce((acc, log) => acc + log.totalCost, 0);
    const totalServiceCostARS = services.reduce((acc, service) => acc + (service.cost || 0), 0);
    const totalOperativeCostARS = totalFuelCostARS + totalServiceCostARS;
    
    // Now in USD
    const totalFuelCostUSD = fuelLogs.reduce((acc, log) => acc + (log.totalCostUsd || 0), 0);
    const totalServiceCostUSD = services.reduce((acc, service) => acc + (service.costUsd || 0), 0);
    const totalOperativeCostUSD = totalFuelCostUSD + totalServiceCostUSD;

    if (fuelLogs.length === 0) return { empty: true };

    const firstLog = fuelLogs[0];
    const lastLog = fuelLogs[fuelLogs.length - 1];
    const kmTraveled = lastLog.odometer - firstLog.odometer;

    const totalRealCostUSD = totalOperativeCostUSD + totalFixedCostInPeriod;
    
    // Costs per KM
    const operativeCostPerKmARS = kmTraveled > 0 ? totalOperativeCostARS / kmTraveled : 0;
    const realCostPerKmUSD = kmTraveled > 0 ? totalRealCostUSD / kmTraveled : 0;
    
    // Other calculations
    const operativeCostPerDayARS = totalOperativeCostARS / periodDays;
    
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
      totalOperativeCost: totalOperativeCostARS, totalFuelCost: totalFuelCostARS, totalServiceCost: totalServiceCostARS, kmTraveled,
      operativeCostPerKm: operativeCostPerKmARS,
      costPerDay: operativeCostPerDayARS,
      avgConsumption, minConsumption, maxConsumption,
      kmPerDay, fuelLogs, avgAutonomy, avgKmBetweenFillUps, empty: false,
      // Amortization values in USD
      totalFixedCostInPeriod,
      dailyFixedCost,
      // Real cost values in USD
      totalRealCostUSD,
      realCostPerKmUSD,
    };
  }, [dateRange, vehicle, allFuelLogsData, allServicesData]);

  if (!vehicle) {
    return <div className="text-center p-8">Por favor, seleccione un vehículo para ver los informes.</div>;
  }
  
  const isLoading = isLoadingLogs || isLoadingServices;

  const toLitersPer100Km = (kmPerLiter: number) => kmPerLiter > 0 ? (100 / kmPerLiter) : 0;

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
                             <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <ReportStatCard icon={DollarSign} title="Costo Operativo Total (ARS)" value={formatCurrency(reportData.totalOperativeCost)} description="Combustible + Servicios" />
                                <ReportStatCard icon={TrendingDown} title="Costo Fijo Total (USD)" value={formatCurrency(reportData.totalFixedCostInPeriod, 'USD')} description="Amortización, Seguro y Patente" />
                                <ReportStatCard icon={Route} title="Distancia Recorrida" value={`${reportData.kmTraveled.toLocaleString()} km`} />
                                <ReportStatCard icon={Car} title="Costo Real Total / km (USD)" value={formatCurrency(reportData.realCostPerKmUSD, 'USD')} description='Costos fijos + operativos' />
                            </div>

                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><DollarSign/> Análisis de Costos</CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                        <ReportStatCard icon={Fuel} title="Costo Operativo / km (ARS)" value={`${formatCurrency(reportData.operativeCostPerKm)}`} variant="small" />
                                        <ReportStatCard icon={Car} title="Costo Operativo / día (ARS)" value={`${formatCurrency(reportData.costPerDay)}`} variant="small" />
                                        <ReportStatCard icon={TrendingDown} title="Costo Fijo / día (USD)" value={`${formatCurrency(reportData.dailyFixedCost, 'USD')}`} variant="small" description='Depreciación, seguro y patente' />
                                        <ReportStatCard icon={Wrench} title="Gasto en Servicios (ARS)" value={`${formatCurrency(reportData.totalServiceCost)}`} variant="small" />
                                        <ReportStatCard icon={Fuel} title="Gasto en Combustible (ARS)" value={`${formatCurrency(reportData.totalFuelCost)}`} variant="small" />
                                    </CardContent>
                                </Card>
                                
                                <Card>
                                    <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Gauge/> Análisis de Consumo y Distancia</CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                        <ReportStatCard title="Autonomía Promedio" value={`${reportData.avgAutonomy.toFixed(0)} km`} description="con tanque lleno" variant="small" />
                                        <ReportStatCard title="Km Promedio / Recarga" value={`${reportData.avgKmBetweenFillUps.toFixed(0)} km`} description="entre tanques llenos" variant="small" />
                                        <ReportStatCard title="Consumo Promedio" value={`${reportData.avgConsumption.toFixed(2)} km/L`} description={`${toLitersPer100Km(reportData.avgConsumption).toFixed(2)} L/100km`} variant="small" />
                                        <ReportStatCard title="Consumo Mínimo (Mejor)" value={`${reportData.maxConsumption.toFixed(2)} km/L`} description={`${toLitersPer100Km(reportData.maxConsumption).toFixed(2)} L/100km`} variant="small" />
                                        <ReportStatCard title="Consumo Máximo (Peor)" value={`${reportData.minConsumption.toFixed(2)} km/L`} description={`${toLitersPer100Km(reportData.minConsumption).toFixed(2)} L/100km`} variant="small" />
                                        <ReportStatCard title="Distancia Promedio / día" value={`${reportData.kmPerDay.toFixed(1)} km`} variant="small" />
                                    </CardContent>
                                </Card>
                            </div>

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
