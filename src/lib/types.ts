export type Vehicle = {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  fuelCapacityLiters: number;
  averageConsumptionKmPerLiter: number;
  imageUrl: string;
  imageHint?: string;
};

export type FuelLog = {
  id: string;
  vehicleId: string;
  date: string; // ISO date string
  odometer: number;
  fuelType: 'Gasolina' | 'Diesel' | 'Etanol';
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
  dueDate?: string; // ISO date string
  dueOdometer?: number;
  notes: string;
  isUrgent: boolean;
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
