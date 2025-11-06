'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import type { Vehicle } from '@/lib/types';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface VehicleContextType {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  selectVehicle: (vehicleId: string) => void;
  isLoading: boolean;
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useUser();
  const firestore = useFirestore();

  const vehiclesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'vehicles'), orderBy('make'));
  }, [firestore, user]);

  const { data: vehicles, isLoading } = useCollection<Vehicle>(vehiclesQuery);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isLoading || !vehicles) {
      return;
    }

    const vehicleIdFromUrl = searchParams.get('vehicle');
    let vehicleToSelect: Vehicle | null = null;

    if (vehicleIdFromUrl) {
      vehicleToSelect = vehicles.find(v => v.id === vehicleIdFromUrl) || null;
    }
    
    if (!vehicleToSelect && vehicles.length > 0) {
      vehicleToSelect = vehicles[0];
    }
    
    setSelectedVehicle(vehicleToSelect);

    const currentParams = new URLSearchParams(searchParams.toString());
    const currentVehicleParam = currentParams.get('vehicle');

    if (vehicleToSelect && currentVehicleParam !== vehicleToSelect.id) {
      currentParams.set('vehicle', vehicleToSelect.id);
      router.replace(`${pathname}?${currentParams.toString()}`);
    } else if (!vehicleToSelect && currentVehicleParam) {
      currentParams.delete('vehicle');
      router.replace(`${pathname}?${currentParams.toString()}`);
    }

  }, [vehicles, isLoading, searchParams, pathname, router]);

  const selectVehicle = (vehicleId: string) => {
    const vehicle = vehicles?.find(v => v.id === vehicleId);
    if (vehicle) {
      setSelectedVehicle(vehicle);
      const params = new URLSearchParams(searchParams.toString());
      params.set('vehicle', vehicleId);
      router.push(`${pathname}?${params.toString()}`);
    }
  };

  return (
    <VehicleContext.Provider value={{ vehicles: vehicles || [], selectedVehicle, selectVehicle, isLoading }}>
      {children}
    </VehicleContext.Provider>
  );
};

export const useVehicles = () => {
  const context = useContext(VehicleContext);
  if (context === undefined) {
    throw new Error('useVehicles must be used within a VehicleProvider');
  }
  return context;
};
