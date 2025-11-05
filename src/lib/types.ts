

export type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  fuelCapacityLiters: number;
  averageConsumptionKmPerLiter: number;
  imageUrl: string;
  imageHint?: string;
  defaultFuelType?: string;
};

export type FuelLog = {
  id: string;
  vehicleId: string;
  userId: string;
  date: string; // ISO date string
  odometer: number;
  fuelType: string;
  pricePerLiter: number;
  totalCost: number;
  liters: number;
  gasStation: string;
  isFillUp: boolean;
  username: string;
  missedPreviousFillUp?: boolean;
};

export type ServiceReminder = {
  id: string;
  vehicleId: string;
  serviceType: string;
  dueDate: string | null;
  dueOdometer: number | null;
  notes: string;
  isCompleted: boolean;
  completedDate: string | null;
  completedOdometer: number | null;
  serviceLocation: string | null;
  cost: number | null;
  isRecurring?: boolean | null;
  recurrenceIntervalKm?: number | null;
  date: string; // Unified date for timeline
};

export type ProcessedFuelLog = FuelLog & {
  distanceTraveled?: number;
  consumption?: number; // km/L
};

// This type is for client-side processing only
export type ProcessedServiceReminder = ServiceReminder & {
    kmsRemaining?: number | null;
    daysRemaining?: number | null;
    isUrgent?: boolean;
    isOverdue?: boolean;
};


export type User = {
  id: string;
  email: string;
  username: string;
};

export type ConfigItem = {
  id: string;
  name: string;
};

export type ConsumptionUnit = 'km/L' | 'L/100km';

export type TimelineItem = {
  type: 'fuel' | 'service';
  date: string;
  data: FuelLog | ServiceReminder;
};
