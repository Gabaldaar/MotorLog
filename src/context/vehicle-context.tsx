'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { Vehicle } from '@/lib/types';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';

interface VehicleContextType {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  selectVehicle: (vehicleId: string) => void;
  isLoading: boolean;
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider = ({ children }: { children: ReactNode }) => {
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { user } = useUser();
  const firestore = useFirestore();

  const vehiclesQuery = useMemoFirebase(() => {
    if (!user) return null;
    // Query the top-level 'vehicles' collection
    return query(collection(firestore, 'vehicles'), orderBy('make'));
  }, [firestore, user]);

  const { data: vehicles, isLoading } = useCollection<Vehicle>(vehiclesQuery);

  useEffect(() => {
    if (isLoading || !vehicles) return;

    const currentVehicleId = searchParams.get('vehicle');
    
    if (currentVehicleId) {
      const vehicleFromUrl = vehicles.find(v => v.id === currentVehicleId);
      if (vehicleFromUrl) {
        if (selectedVehicle?.id !== vehicleFromUrl.id) {
          setSelectedVehicle(vehicleFromUrl);
        }
        return; 
      }
    }
    
    if(selectedVehicle && vehicles.some(v => v.id === selectedVehicle.id)) {
        return;
    }

    if (vehicles.length > 0) {
      const vehicleToSelect = vehicles[0];
      setSelectedVehicle(vehicleToSelect);
      if (currentVehicleId !== vehicleToSelect.id) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('vehicle', vehicleToSelect.id);
        router.replace(`${pathname}?${params.toString()}`);
      }
    } else {
      setSelectedVehicle(null);
      const params = new URLSearchParams(searchParams.toString());
      if (params.has('vehicle')) {
          params.delete('vehicle');
          router.replace(`${pathname}?${params.toString()}`);
      }
    }
  }, [searchParams, vehicles, pathname, router, isLoading, selectedVehicle]);

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
