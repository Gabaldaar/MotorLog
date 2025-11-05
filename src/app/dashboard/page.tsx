'use client';

import { Suspense } from 'react';
import type { ProcessedFuelLog, ServiceReminder } from '@/lib/types';
import WelcomeBanner from '@/components/dashboard/welcome-banner';
import StatCard from '@/components/dashboard/stat-card';
import FuelConsumptionChart from '@/components/dashboard/fuel-consumption-chart';
import ServiceReminders from '@/components/dashboard/service-reminders';
import FuelEstimate from '@/components/dashboard/fuel-estimate';
import RecentFuelLogs from '@/components/dashboard/recent-fuel-logs';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

function processFuelLogs(logs: ProcessedFuelLog[]): ProcessedFuelLog[] {
  const sortedLogs = logs
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return sortedLogs.map((log, index) => {
    if (index === 0) {
      return { ...log };
    }
    const prevLog = sortedLogs[index - 1];
    const distanceTraveled = log.odometer - prevLog.odometer;
    const consumption = distanceTraveled > 0 && log.liters > 0 ? distanceTraveled / log.liters : 0;
    
    return {
      ...log,
      distanceTraveled,
      consumption: parseFloat(consumption.toFixed(2)),
    };
  }).reverse(); // Reverse to show latest first
}

export default function DashboardPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();

  const fuelLogsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('date', 'desc')
    );
  }, [firestore, user, vehicle]);

  const remindersQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'service_reminders'),
      orderBy('dueDate', 'asc')
    );
  }, [firestore, user, vehicle]);

  const { data: fuelLogs, isLoading: isLoadingLogs } = useCollection<ProcessedFuelLog>(fuelLogsQuery);
  const { data: serviceReminders, isLoading: isLoadingReminders } = useCollection<ServiceReminder>(remindersQuery);

  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }
  
  if (isLoadingLogs || isLoadingReminders) {
    return (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  const vehicleFuelLogs = processFuelLogs(fuelLogs || []);
  const vehicleServiceReminders = serviceReminders || [];
  
  const totalSpent = vehicleFuelLogs.reduce((acc, log) => acc + log.totalCost, 0);
  const totalLiters = vehicleFuelLogs.reduce((acc, log) => acc + log.liters, 0);
  
  const consumptionLogs = vehicleFuelLogs.filter(log => log.consumption && log.consumption > 0);
  const avgConsumption = consumptionLogs.length > 0 
    ? consumptionLogs.reduce((acc, log) => acc + (log.consumption || 0), 0) / consumptionLogs.length
    : vehicle.averageConsumptionKmPerLiter;

  const nextService = [...vehicleServiceReminders].sort((a,b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())[0];

  return (
    <div className="flex flex-col gap-6">
      <WelcomeBanner vehicle={vehicle} lastLog={vehicleFuelLogs[0]} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Consumo Promedio" value={`${avgConsumption.toFixed(2)} km/L`} />
        <StatCard title="Costo Total" value={`$${totalSpent.toFixed(2)}`} />
        <StatCard title="Litros Totales" value={`${totalLiters.toFixed(2)} L`} />
        <StatCard title="Próximo Servicio" value={nextService?.serviceType || 'N/A'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <FuelConsumptionChart data={vehicleFuelLogs} />
        </div>
        <div className="lg:col-span-2">
          <RecentFuelLogs data={vehicleFuelLogs} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
           <Suspense fallback={<div>Cargando estimación...</div>}>
            <FuelEstimate vehicle={vehicle} />
           </Suspense>
        </div>
        <div className="lg:col-span-2">
          <ServiceReminders data={vehicleServiceReminders} />
        </div>
      </div>
    </div>
  );
}
