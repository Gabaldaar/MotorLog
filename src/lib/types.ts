
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
};

export type ProcessedFuelLog = FuelLog & {
  distanceTraveled?: number;
  consumption?: number; // km/L
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

    