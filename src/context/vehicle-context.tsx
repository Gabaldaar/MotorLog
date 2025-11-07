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

    const currentVehicleIdFromUrl = searchParams.get('vehicle');
    
    // 1. Priority: Vehicle ID from URL
    if (currentVehicleIdFromUrl) {
      const vehicleFromUrl = vehicles.find(v => v.id === currentVehicleIdFromUrl);
      if (vehicleFromUrl) {
        if (selectedVehicle?.id !== vehicleFromUrl.id) {
          setSelectedVehicle(vehicleFromUrl);
        }
        return; 
      }
    }

    // 2. Priority: Last selected vehicle from localStorage
    const lastSelectedVehicleId = localStorage.getItem('lastSelectedVehicleId');
    if (lastSelectedVehicleId) {
        const lastSelected = vehicles.find(v => v.id === lastSelectedVehicleId);
        if (lastSelected) {
            setSelectedVehicle(lastSelected);
            // Update URL silently
            const params = new URLSearchParams(searchParams.toString());
            params.set('vehicle', lastSelected.id);
            router.replace(`${pathname}?${params.toString()}`);
            return;
        }
    }
    
    // 3. Fallback: First vehicle in the list
    if (vehicles.length > 0) {
      const vehicleToSelect = vehicles[0];
      setSelectedVehicle(vehicleToSelect);
      // Update URL silently
      const params = new URLSearchParams(searchParams.toString());
      params.set('vehicle', vehicleToSelect.id);
      router.replace(`${pathname}?${params.toString()}`);
    } else {
      // 4. No vehicles available
      setSelectedVehicle(null);
      const params = new URLSearchParams(searchParams.toString());
      if (params.has('vehicle')) {
          params.delete('vehicle');
          router.replace(`${pathname}?${params.toString()}`);
      }
    }
  }, [searchParams, vehicles, pathname, router, isLoading]);

  const selectVehicle = (vehicleId: string) => {
    const vehicle = vehicles?.find(v => v.id === vehicleId);
    if (vehicle) {
      setSelectedVehicle(vehicle);
      localStorage.setItem('lastSelectedVehicleId', vehicleId); // Save to localStorage
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
