'use client';

import { useState, useMemo, useEffect } from 'react';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import type { ProcessedFuelLog, ServiceReminder, Vehicle } from '@/lib/types';
import { getYear, getMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Car, Fuel, Wrench, Gauge, Calendar, DollarSign, Route, TrendingUp, Droplets, AlertTriangle, Loader2 } from 'lucide-react';
import { ReportStatCard } from '@/components/reports/report-stat-card';
import { EvolutionChart } from '@/components/reports/evolution-chart';
import FuelConsumptionChart from '@/components/dashboard/fuel-consumption-chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonthlyCostsChart } from '@/components/reports/monthly-costs-chart';
import { MonthlyDistanceChart } from '@/components/reports/monthly-distance-chart';
import { formatCurrency } from '@/lib/utils';
import { getOfficialDolarRate } from '@/ai/flows/get-exchange-rate';
import { calculateCostsPerKm, calculateTotalCostInARS } from '@/lib/cost-calculator';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';


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
        const rateData = await getOfficialDolarRate();
        setExchangeRate(rateData.rate);
        toast({
            title: 'Cotización Obtenida',
            description: `Dólar Oficial (Vendedor): ${formatCurrency(rateData.rate)}`,
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

  const costPerKmData = useMemo(() => {
    if (!vehicle || !allFuelLogsData || !allServicesData) return null;
    
    const lastFuelLog = allFuelLogsData.length > 0 ? allFuelLogsData[allFuelLogsData.length - 1] : null;
    const avgConsumption = vehicle.averageConsumptionKmPerLiter || 0;
    const lastFuelPrice = lastFuelLog?.pricePerLiter || 0;

    const costsPerKm = calculateCostsPerKm(vehicle, avgConsumption, lastFuelPrice);
    const detailedCostsARS = exchangeRate ? calculateTotalCostInARS(costsPerKm, exchangeRate) : null;

    return {
        fuelCostPerKm: detailedCostsARS?.fuelCostPerKm_ARS || 0,
        totalCostPerKm: detailedCostsARS?.totalCostPerKm_ARS,
    }

  }, [vehicle, allFuelLogsData, allServicesData, exchangeRate]);

  const { availableYears, annualData, logsForSelectedYear, annualStats } = useMemo(() => {
    if (!allFuelLogsData || !allServicesData) return { availableYears: [], annualData: null, logsForSelectedYear: [], annualStats: null };
    
    const years = new Set<string>();
    allFuelLogsData.forEach(log => years.add(String(getYear(new Date(log.date)))));
    allServicesData.forEach(service => {
        if(service.completedDate) years.add(String(getYear(new Date(service.completedDate))))
    });
    const sortedYears = Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    
    const year = parseInt(selectedYear);
    
    const logsInYear = processFuelLogs(allFuelLogsData.filter(log => getYear(new Date(log.date)) === year));
    const servicesInYear = allServicesData.filter(service => service.isCompleted && service.completedDate && getYear(new Date(service.completedDate)) === year);

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      name: new Date(year, i).toLocaleString('es-ES', { month: 'short' }),
      combustible: 0,
      servicios: 0,
      total: 0,
      km: 0,
    }));

    // Calculate costs
    logsInYear.forEach(log => {
      const month = getMonth(new Date(log.date));
      monthlyData[month].combustible += log.totalCost;
    });

    servicesInYear.forEach(service => {
        const month = getMonth(new Date(service.completedDate!));
        monthlyData[month].servicios += service.cost || 0;
      });
      
    // Calculate distance
    for (let i = 0; i < 12; i++) {
        const logsInMonth = logsInYear.filter(log => getMonth(new Date(log.date)) === i);
        if (logsInMonth.length > 1) {
            const firstOdo = logsInMonth[0].odometer;
            const lastOdo = logsInMonth[logsInMonth.length - 1].odometer;
            monthlyData[i].km = lastOdo - firstOdo;
        } else if (logsInMonth.length === 1) {
            monthlyData[i].km = logsInMonth[0].distanceTraveled || 0;
        }
    }


    monthlyData.forEach(month => month.total = month.combustible + month.servicios);
    
    const totalKm = monthlyData.reduce((acc, data) => acc + data.km, 0);
    const totalFuelCost = monthlyData.reduce((acc, data) => acc + data.combustible, 0);
    const totalServicesCost = monthlyData.reduce((acc, data) => acc + data.servicios, 0);
    const totalAnnualCost = totalFuelCost + totalServicesCost;

    const stats = {
        totalKm,
        totalFuelCost,
        totalServicesCost,
        totalAnnualCost
    }

    return { availableYears: sortedYears, annualData: monthlyData, logsForSelectedYear: logsInYear, annualStats: stats };
  }, [allFuelLogsData, allServicesData, selectedYear]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

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
                    <CardTitle className="flex items-center gap-2"><DollarSign /> Costos por Kilómetro (Global)</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <ReportStatCard icon={Fuel} title="Costo Combustible / km (ARS)" value={formatCurrency(costPerKmData?.fuelCostPerKm || 0)} description="Costo variable de combustible por kilómetro."/>
                   <ReportStatCard icon={Car} title="Costo Total Real / km (ARS)" value={costPerKmData?.totalCostPerKm ? formatCurrency(costPerKmData.totalCostPerKm) : 'N/A'} description="Incluye combustible, amortización y costos fijos."/>
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
                <CardContent className="space-y-6">
                     <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <ReportStatCard variant="small" title="Km Recorridos" value={annualStats?.totalKm.toLocaleString() + ' km' ?? '0 km'} />
                        <ReportStatCard variant="small" title="Gasto Combustible" value={formatCurrency(annualStats?.totalFuelCost ?? 0)} />
                        <ReportStatCard variant="small" title="Gasto Servicios" value={formatCurrency(annualStats?.totalServicesCost ?? 0)} />
                        <ReportStatCard variant="small" title="Gasto Total (ARS)" value={formatCurrency(annualStats?.totalAnnualCost ?? 0)} />
                     </div>

                    <Separator />

                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <MonthlyCostsChart data={annualData} />
                        <MonthlyDistanceChart data={annualData} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <FuelConsumptionChart data={logsForSelectedYear} />
                        <EvolutionChart 
                            title="Evolución del Consumo (Rendimiento)" 
                            data={logsForSelectedYear.filter(log => log.consumption && log.consumption > 0)}
                            dataKey="date"
                            valueKey="consumption"
                            valueFormatter={(val) => `${val.toFixed(2)} km/L`}
                            tooltipLabel="Rendimiento"
                            icon={TrendingUp}
                        />
                         <EvolutionChart 
                            title="Evolución del Precio del Combustible (ARS)" 
                            data={logsForSelectedYear}
                            dataKey="date"
                            valueKey="pricePerLiter"
                            valueFormatter={(val) => `${formatCurrency(val)} / L`}
                            tooltipLabel="Precio/L (ARS)"
                            icon={Droplets}
                        />
                        <EvolutionChart 
                            title="Evolución del Precio del Combustible (USD)" 
                            data={logsForSelectedYear.filter(log => log.pricePerLiterUsd && log.pricePerLiterUsd > 0)}
                            dataKey="date"
                            valueKey="pricePerLiterUsd"
                            valueFormatter={(val) => `${formatCurrency(val, 'USD')} / L`}
                            tooltipLabel="Precio/L (USD)"
                            icon={DollarSign}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
      )}
    </div>
  );
}
