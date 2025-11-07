'use client';

import { useMemo, useState } from 'react';
import type { Trip, ProcessedFuelLog, Vehicle, ConfigItem } from '@/lib/types';
import { useVehicles } from '@/context/vehicle-context';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Plus, Route, Loader2, User, Filter } from 'lucide-react';
import AddTripDialog from '@/components/dashboard/add-trip-dialog';
import ActiveTrips from '@/components/trips/active-trips';
import CompletedTrips from '@/components/trips/completed-trips';
import { DateRangePicker } from '@/components/reports/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function TripsPage() {
  const { selectedVehicle: vehicle } = useVehicles();
  const { user } = useUser();
  const firestore = useFirestore();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [selectedTripType, setSelectedTripType] = useState<string>('all');


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
  
  const tripTypesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'trip_types'), orderBy('name'));
  }, [firestore, user]);


  const { data: trips, isLoading: isLoadingTrips } = useCollection<Trip>(tripsQuery);
  const { data: fuelLogs, isLoading: isLoadingFuelLogs } = useCollection<ProcessedFuelLog>(fuelLogsQuery);
  const { data: lastFuelLogData, isLoading: isLoadingLastLog } = useCollection<ProcessedFuelLog>(lastFuelLogQuery);
  const { data: tripTypes, isLoading: isLoadingTripTypes } = useCollection<ConfigItem>(tripTypesQuery);


  const { activeTrips, completedTrips, uniqueDrivers } = useMemo(() => {
    const active: Trip[] = [];
    const completed: Trip[] = [];
    const drivers = new Set<string>();

    if (!trips) return { activeTrips: [], completedTrips: [], uniqueDrivers: [] };

    trips.forEach(trip => {
      drivers.add(trip.username);
    });

    const from = dateRange?.from ? startOfDay(dateRange.from) : null;
    const to = dateRange?.to ? endOfDay(dateRange.to) : null;

    const filteredTrips = trips.filter(trip => {
      const driverMatch = selectedDriver === 'all' || trip.username === selectedDriver;
      const typeMatch = selectedTripType === 'all' || trip.tripType === selectedTripType;
      return driverMatch && typeMatch;
    });

    filteredTrips.forEach(trip => {
      if (trip.status === 'active') {
        active.push(trip);
      } else {
        if (trip.endDate) {
           const tripEndDate = new Date(trip.endDate);
           if ((!from || tripEndDate >= from) && (!to || tripEndDate <= to)) {
              completed.push(trip);
           }
        }
      }
    });

    return { activeTrips: active, completedTrips: completed, uniqueDrivers: Array.from(drivers) };
  }, [trips, dateRange, selectedDriver, selectedTripType]);

  if (!vehicle) {
    return <div className="text-center">Por favor, seleccione un vehículo.</div>;
  }
  
  const lastOdometer = lastFuelLogData?.[0]?.odometer || 0;
  const isLoading = isLoadingTrips || isLoadingFuelLogs || isLoadingLastLog || isLoadingTripTypes;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h1 className="font-headline text-3xl">Gestión de Viajes</h1>
            <p className="text-muted-foreground">Registra y analiza tus viajes de trabajo, vacaciones y más.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <AddTripDialog vehicleId={vehicle.id} lastOdometer={lastOdometer}>
            <Button>
              <Plus className="-ml-1 mr-2 h-4 w-4" />
              Iniciar Viaje
            </Button>
          </AddTripDialog>
        </div>
      </div>
      
      <Card>
        <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
                <div className='flex items-center gap-2'>
                    <Filter className="h-5 w-5" />
                    <CardTitle className='text-lg'>Filtros</CardTitle>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
                    <div className="grid grid-cols-2 gap-2">
                        <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                            <SelectTrigger>
                                <SelectValue placeholder="Conductor" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los Conductores</SelectItem>
                                {uniqueDrivers.map(driver => (
                                    <SelectItem key={driver} value={driver}>{driver}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={selectedTripType} onValueChange={setSelectedTripType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Tipo de Viaje" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los Tipos</SelectItem>
                                {tripTypes?.map(type => (
                                    <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        </CardHeader>
      </Card>


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
             {trips && trips.length > 0 && completedTrips.length === 0 && activeTrips.length === 0 && (
                <div className="h-64 text-center flex flex-col items-center justify-center rounded-lg border-2 border-dashed">
                    <Route className="h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No hay viajes en este período o que coincidan con los filtros.</p>
                    <p className="text-sm text-muted-foreground">Ajusta los filtros para ver otros viajes.</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
}
