
'use client';

import { Suspense } from 'react';
import type { ProcessedFuelLog, ServiceReminder, ProcessedServiceReminder } from '@/lib/types';
import WelcomeBanner from '@/components/dashboard/welcome-banner';
import StatCard from '@/components/dashboard/stat-card';
import FuelConsumptionChart from '@/components/dashboard/fuel-consumption-chart';
import ServiceReminders from '@/components/dashboard/service-reminders';
import RecentFuelLogs from '@/components/dashboard/recent-fuel-logs';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { usePreferences } from '@/context/preferences-context';
import { differenceInDays } from 'date-fns';

function processFuelLogs(logs: ProcessedFuelLog[], vehicle: { averageConsumptionKmPerLiter?: number }): { processedLogs: ProcessedFuelLog[], avgConsumption: number } {
  const sortedLogs = logs
    .filter(log => log && typeof log.date === 'string')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const processed = sortedLogs.map((log, index) => {
    if (index === 0) {
      return { ...log };
    }
    const prevLog = sortedLogs[index - 1];
    if (!prevLog) return {...log};
    
    const distanceTraveled = log.odometer - prevLog.odometer;
    // Calculate consumption only if the previous log was a fill-up
    // and the current log is NOT marked as having a missed previous fill-up.
    const consumption = prevLog.isFillUp && !log.missedPreviousFillUp && distanceTraveled > 0 && log.liters > 0 
      ? distanceTraveled / log.liters 
      : 0;
    
    return {
      ...log,
      distanceTraveled,
      consumption: parseFloat(consumption.toFixed(2)),
    };
  }).reverse(); // Reverse to show latest first

  const consumptionLogs = processed.filter(log => log.consumption && log.consumption > 0);
  const avgConsumption = consumptionLogs.length > 0 
    ? consumptionLogs.reduce((acc, log) => acc + (log.consumption || 0), 0) / consumptionLogs.length
    : vehicle.averageConsumptionKmPerLiter || 0;

  return { processedLogs: processed, avgConsumption };
}

export default function DashboardPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { consumptionUnit, getFormattedConsumption, urgencyThresholdDays, urgencyThresholdKm } = usePreferences();

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

  const lastFuelLogQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
      orderBy('odometer', 'desc'),
      limit(1)
    );
  }, [firestore, user, vehicle]);


  const { data: fuelLogs, isLoading: isLoadingLogs } = useCollection<ProcessedFuelLog>(fuelLogsQuery);
  const { data: serviceReminders, isLoading: isLoadingReminders } = useCollection<ServiceReminder>(remindersQuery);
  const { data: lastFuelLog, isLoading: isLoadingLastLog } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);

  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }
  
  if (isLoadingLogs || isLoadingReminders || isLoadingLastLog) {
    return (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  const { processedLogs: vehicleFuelLogs, avgConsumption } = processFuelLogs(fuelLogs || [], vehicle);
  const vehicleWithAvgConsumption = { ...vehicle, averageConsumptionKmPerLiter: avgConsumption };
  
  const totalSpent = vehicleFuelLogs.reduce((acc, log) => acc + log.totalCost, 0);
  const totalLiters = vehicleFuelLogs.reduce((acc, log) => acc + log.liters, 0);

  const lastOdometer = lastFuelLog?.[0]?.odometer || 0;
  
  const pendingReminders: ProcessedServiceReminder[] = (serviceReminders || [])
    .filter(r => !r.isCompleted)
    .map(r => {
        const kmsRemaining = r.dueOdometer ? r.dueOdometer - lastOdometer : null;
        const daysRemaining = r.dueDate ? differenceInDays(new Date(r.dueDate), new Date()) : null;
        
        const isOverdue = (kmsRemaining !== null && kmsRemaining < 0) || (daysRemaining !== null && daysRemaining < 0);
        const isUrgent = !isOverdue && (
            (kmsRemaining !== null && kmsRemaining <= urgencyThresholdKm) || 
            (daysRemaining !== null && daysRemaining <= urgencyThresholdDays)
        );

        return { ...r, isOverdue, isUrgent };
    });

  const sortedPendingReminders = [...pendingReminders].sort((a, b) => {
    const aUrgency = a.dueOdometer ? a.dueOdometer - lastOdometer : Infinity;
    const bUrgency = b.dueOdometer ? b.dueOdometer - lastOdometer : Infinity;

    if (a.dueOdometer && b.dueOdometer) return aUrgency - bUrgency;
    if (a.dueOdometer) return -1; // Prioritize odometer if only one has it
    if (b.dueOdometer) return 1;

    const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return aDate - bDate;
  });

  const nextService = sortedPendingReminders[0];

  const getNextServiceValue = () => {
    if (!nextService) return { value: 'N/A', description: 'Todo en orden' };
    
    if (nextService.dueDate && nextService.dueOdometer) {
       return { 
        value: formatDate(nextService.dueDate),
        description: `o a los ${nextService.dueOdometer.toLocaleString()} km`
      };
    }
    if (nextService.dueDate) {
      return { 
        value: formatDate(nextService.dueDate), 
        description: nextService.serviceType 
      };
    }
    if (nextService.dueOdometer) {
      return { 
        value: `${nextService.dueOdometer.toLocaleString()} km`, 
        description: nextService.serviceType 
      };
    }
    return { value: 'Revisar', description: nextService.serviceType };
  };

  const nextServiceInfo = getNextServiceValue();

  return (
    <div className="flex flex-col gap-6">
      <WelcomeBanner vehicle={vehicleWithAvgConsumption} lastLog={vehicleFuelLogs[0]} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Consumo Promedio" value={getFormattedConsumption(avgConsumption)} description={consumptionUnit} />
        <StatCard title="Costo Total" value={`$${totalSpent.toFixed(2)}`} />
        <StatCard title="Litros Totales" value={`${totalLiters.toFixed(2)} L`} />
        <StatCard 
          title="Próximo Servicio" 
          value={nextServiceInfo.value}
          description={nextServiceInfo.description}
        />
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
           <ServiceReminders data={pendingReminders} />
        </div>
        <div className="lg:col-span-2">
          
        </div>
      </div>
    </div>
  );
}
