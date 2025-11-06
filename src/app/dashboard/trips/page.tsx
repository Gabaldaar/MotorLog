'use client';

import { useMemo } from 'react';
import type { Trip, ProcessedFuelLog, Vehicle } from '@/lib/types';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Plus, Route, Loader2 } from 'lucide-react';
import AddTripDialog from '@/components/dashboard/add-trip-dialog';
import ActiveTrips from '@/components/trips/active-trips';
import CompletedTrips from '@/components/trips/completed-trips';

export default function TripsPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();

  const tripsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
      collection(firestore, 'vehicles', vehicle.id, 'trips'),
      orderBy('startDate', 'desc')
    );
  }, [firestore, user, vehicle]);
  
  const fuelLogsQuery = useMemoFirebase(() => {
    if (!user || !vehicle) return null;
    return query(
        collection(firestore, 'vehicles', vehicle.id, 'fuel_records'),
        orderBy('odometer', 'desc')
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

  const { data: trips, isLoading: isLoadingTrips } = useCollection<Trip>(tripsQuery);
  const { data: fuelLogs, isLoading: isLoadingFuelLogs } = useCollection<ProcessedFuelLog>(fuelLogsQuery);
  const { data: lastFuelLogData, isLoading: isLoadingLastLog } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);

  const { activeTrips, completedTrips } = useMemo(() => {
    const active: Trip[] = [];
    const completed: Trip[] = [];
    (trips || []).forEach(trip => {
      if (trip.status === 'active') {
        active.push(trip);
      } else {
        completed.push(trip);
      }
    });
    return { activeTrips: active, completedTrips: completed };
  }, [trips]);

  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }
  
  const lastOdometer = lastFuelLogData?.[0]?.odometer || 0;
  const isLoading = isLoadingTrips || isLoadingFuelLogs || isLoadingLastLog;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h1 className="font-headline text-3xl">Gestión de Viajes</h1>
            <p className="text-muted-foreground">Registra y analiza tus viajes de trabajo, vacaciones y más.</p>
        </div>
        <AddTripDialog vehicleId={vehicle.id} lastOdometer={lastOdometer}>
          <Button>
            <Plus className="-ml-1 mr-2 h-4 w-4" />
            Iniciar Viaje
          </Button>
        </AddTripDialog>
      </div>

      {isLoading ? (
        <div className="h-64 text-center flex flex-col items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">Cargando viajes...</p>
        </div>
      ) : (
        <div className="space-y-8">
            <ActiveTrips trips={activeTrips} vehicleId={vehicle.id} lastOdometer={lastOdometer} />
            <CompletedTrips trips={completedTrips} vehicle={vehicle as Vehicle} allFuelLogs={fuelLogs || []} />

            {trips?.length === 0 && (
                <div className="h-64 text-center flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
                    <Route className="h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No hay viajes registrados.</p>
                    <p className="text-sm text-muted-foreground">Haz clic en "Iniciar Viaje" para registrar tu primero.</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
}
