
'use client';

import { useMemo } from 'react';
import type { ProcessedFuelLog, ServiceReminder, ProcessedServiceReminder, Vehicle } from '@/lib/types';
import WelcomeBanner from '@/components/dashboard/welcome-banner';
import StatCard from '@/components/dashboard/stat-card';
import FuelConsumptionChart from '@/components/dashboard/fuel-consumption-chart';
import ServiceReminders from '@/components/dashboard/service-reminders';
import RecentFuelLogs from '@/components/dashboard/recent-fuel-logs';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import { usePreferences } from '@/context/preferences-context';
import { differenceInDays } from 'date-fns';
import UrgentServicesAlert from '@/components/dashboard/urgent-services-alert';
import EstimatedRefuelCard from '@/components/dashboard/estimated-refuel-card';

function processFuelLogs(logs: ProcessedFuelLog[]): ProcessedFuelLog[] {
  // Sort logs by odometer ascending to calculate consumption correctly
  const sortedLogsAsc = logs.sort((a, b) => a.odometer - b.odometer);

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

  // Return logs sorted descending by date for display
  return calculatedLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export default function DashboardPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const { consumptionUnit, getFormattedConsumption, urgencyThresholdDays, urgencyThresholdKm } = usePreferences();

  const allFuelLogsQuery = useMemoFirebase(() => {
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
  
  const { data: allFuelLogsData, isLoading: isLoadingLogs } = useCollection<ProcessedFuelLog>(allFuelLogsQuery);
  const { data: serviceReminders, isLoading: isLoadingReminders } = useCollection<ServiceReminder>(remindersQuery);
  
  const vehicleFuelLogs = useMemo(() => processFuelLogs(allFuelLogsData || []), [allFuelLogsData]);
  const lastOdometer = useMemo(() => vehicleFuelLogs?.[0]?.odometer || 0, [vehicleFuelLogs]);

  const avgConsumption = useMemo(() => {
    const consumptionLogs = vehicleFuelLogs.filter(log => log.consumption && log.consumption > 0);
    return consumptionLogs.length > 0 
      ? consumptionLogs.reduce((acc, log) => acc + (log.consumption || 0), 0) / consumptionLogs.length
      : vehicle?.averageConsumptionKmPerLiter || 0;
  }, [vehicleFuelLogs, vehicle?.averageConsumptionKmPerLiter]);
  
  const vehicleWithAvgConsumption = useMemo(() => {
    if (!vehicle) return null;
    return { ...vehicle, averageConsumptionKmPerLiter: avgConsumption };
  }, [vehicle, avgConsumption]);

  const totalSpent = useMemo(() => vehicleFuelLogs.reduce((acc, log) => acc + log.totalCost, 0), [vehicleFuelLogs]);
  const totalLiters = useMemo(() => vehicleFuelLogs.reduce((acc, log) => acc + log.liters, 0), [vehicleFuelLogs]);

  const sortedPendingReminders = useMemo(() => {
      if (!serviceReminders) return [];
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

            return { ...r, kmsRemaining, daysRemaining, isOverdue, isUrgent };
        });

    return [...pendingReminders].sort((a, b) => {
      const aUrgency = a.dueOdometer ? a.dueOdometer - lastOdometer : Infinity;
      const bUrgency = b.dueOdometer ? b.dueOdometer - lastOdometer : Infinity;

      if (a.dueOdometer && b.dueOdometer) return aUrgency - bUrgency;
      if (a.dueOdometer) return -1;
      if (b.dueOdometer) return 1;

      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aDate - bDate;
    });
  }, [serviceReminders, lastOdometer, urgencyThresholdKm, urgencyThresholdDays]);
  
  const urgentOrOverdueReminders = useMemo(() => sortedPendingReminders.filter(r => r.isOverdue || r.isUrgent), [sortedPendingReminders]);

  const nextServiceInfo = useMemo(() => {
    const nextService = sortedPendingReminders[0];
    if (!nextService) return { value: 'N/A', description: 'Todo en orden' };
    
    let mainValue = 'Revisar';
    let description = nextService.serviceType;

    if (nextService.dueOdometer && nextService.dueDate) {
        const kmRatio = nextService.kmsRemaining !== null ? nextService.kmsRemaining / (nextService.recurrenceIntervalKm || 5000) : 1;
        const dayRatio = nextService.daysRemaining !== null ? nextService.daysRemaining / 30 : 1;
        if (kmRatio <= dayRatio) {
            mainValue = `${nextService.dueOdometer.toLocaleString()} km`;
        } else {
            mainValue = formatDate(nextService.dueDate);
        }
    } else if (nextService.dueOdometer) {
        mainValue = `${nextService.dueOdometer.toLocaleString()} km`;
    } else if (nextService.dueDate) {
        mainValue = formatDate(nextService.dueDate);
    }
    
    let remainingDesc = [];
    if (nextService.kmsRemaining !== null) {
        if (nextService.kmsRemaining <= 0) {
            remainingDesc.push(`Vencido por ${Math.abs(nextService.kmsRemaining).toLocaleString()} km`);
        } else {
            remainingDesc.push(`Faltan ${nextService.kmsRemaining.toLocaleString()} km`);
        }
    }
     if (nextService.daysRemaining !== null) {
        if (nextService.daysRemaining < 0) {
            remainingDesc.push(`Vencido hace ${Math.abs(nextService.daysRemaining)} días`);
        } else {
            remainingDesc.push(`Faltan ${nextService.daysRemaining} días`);
        }
    }
    
    if (remainingDesc.length > 0) {
        description = remainingDesc.join(' o ');
    }

    return { value: mainValue, description };
  }, [sortedPendingReminders]);


  if (isLoadingLogs || isLoadingReminders || !vehicle || !vehicleWithAvgConsumption) {
    return (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <UrgentServicesAlert reminders={urgentOrOverdueReminders} />
      <WelcomeBanner vehicle={vehicleWithAvgConsumption} allFuelLogs={allFuelLogsData || []} lastOdometer={lastOdometer} />
      
      <EstimatedRefuelCard vehicle={vehicleWithAvgConsumption} allFuelLogs={allFuelLogsData || []} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Consumo Promedio" value={getFormattedConsumption(avgConsumption)} description={consumptionUnit} />
        <StatCard title="Costo Total" value={formatCurrency(totalSpent)} />
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
           <RecentFuelLogs data={vehicleFuelLogs.slice(0, 5)} />
        </div>
      </div>

       <div className="grid grid-cols-1 gap-6">
          <ServiceReminders data={sortedPendingReminders} />
      </div>

    </div>
  );
}
