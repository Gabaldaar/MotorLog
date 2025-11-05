'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import type { ConsumptionUnit } from '@/lib/types';

interface PreferencesContextType {
  consumptionUnit: ConsumptionUnit;
  setConsumptionUnit: (unit: ConsumptionUnit) => void;
  getConsumptionValue: (kmPerLiter?: number | null) => number;
  getFormattedConsumption: (kmPerLiter?: number | null) => string;
  urgencyThresholdDays: number;
  setUrgencyThresholdDays: (days: number) => void;
  urgencyThresholdKm: number;
  setUrgencyThresholdKm: (km: number) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

const isClient = typeof window !== 'undefined';

const getItemFromStorage = <T,>(key: string, defaultValue: T): T => {
    if (!isClient) return defaultValue;
    try {
        const item = localStorage.getItem(key);
        if (item) {
            const parsedItem = JSON.parse(item);
            // Ensure the type matches, especially for numbers
            if (typeof parsedItem === typeof defaultValue) {
                return parsedItem;
            }
        }
        return defaultValue;
    } catch (error) {
        console.error(`Error reading from localStorage key “${key}”:`, error);
        return defaultValue;
    }
};

const setItemInStorage = <T,>(key: string, value: T) => {
    if (!isClient) return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Error setting localStorage key “${key}”:`, error);
    }
}


export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  const [consumptionUnit, setConsumptionUnitState] = useState<ConsumptionUnit>(() => 
    getItemFromStorage('consumptionUnit', 'km/L')
  );
  const [urgencyThresholdDays, setUrgencyThresholdDaysState] = useState<number>(() => 
    getItemFromStorage('urgencyThresholdDays', 15)
  );
  const [urgencyThresholdKm, setUrgencyThresholdKmState] = useState<number>(() => 
    getItemFromStorage('urgencyThresholdKm', 1000)
  );

  useEffect(() => {
    setItemInStorage('consumptionUnit', consumptionUnit);
  }, [consumptionUnit]);

  useEffect(() => {
    setItemInStorage('urgencyThresholdDays', urgencyThresholdDays);
  }, [urgencyThresholdDays]);

  useEffect(() => {
    setItemInStorage('urgencyThresholdKm', urgencyThresholdKm);
  }, [urgencyThresholdKm]);

  const setConsumptionUnit = (unit: ConsumptionUnit) => {
    setConsumptionUnitState(unit);
  };

  const setUrgencyThresholdDays = (days: number) => {
    setUrgencyThresholdDaysState(days);
  };

  const setUrgencyThresholdKm = (km: number) => {
    setUrgencyThresholdKmState(km);
  };

  const getConsumptionValue = useCallback((kmPerLiter?: number | null): number => {
    if (!kmPerLiter || kmPerLiter <= 0) return 0;
    if (consumptionUnit === 'L/100km') {
      const litersPer100km = (100 / kmPerLiter);
      return parseFloat(litersPer100km.toFixed(2));
    }
    return parseFloat(kmPerLiter.toFixed(2));
  }, [consumptionUnit]);

  const getFormattedConsumption = useCallback((kmPerLiter?: number | null): string => {
    const value = getConsumptionValue(kmPerLiter);
    if (value <= 0) return 'N/A';
    return `${value}`;
  }, [getConsumptionValue]);

  return (
    <PreferencesContext.Provider 
      value={{ 
        consumptionUnit, 
        setConsumptionUnit, 
        getConsumptionValue, 
        getFormattedConsumption,
        urgencyThresholdDays,
        setUrgencyThresholdDays,
        urgencyThresholdKm,
        setUrgencyThresholdKm,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};
