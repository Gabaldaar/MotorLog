
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
  // Financial data for amortization
  purchasePrice?: number;
  purchaseDate?: string | null; // ISO Date string
  annualInsuranceCost?: number;
  annualPatentCost?: number;
  usefulLifeYears?: number;
  resaleValue?: number;
  // New detailed cost fields
  kmPerYear?: number; // KA
  maintenanceCost?: number; // SM
  maintenanceKm?: number; // KSM
  tiresCost?: number; // N
  tiresKm?: number; // KN
};

export type FuelLog = {
  id: string;
  vehicleId: string;
  userId: string;
  username: string;
  date: string; // ISO date string
  odometer: number;
  fuelType: string;
  pricePerLiter: number;
  pricePerLiterUsd?: number;
  totalCost: number;
  totalCostUsd?: number;
  exchangeRate?: number;
  liters: number;
  gasStation: string;
  isFillUp: boolean;
  missedPreviousFillUp?: boolean;
  logType?: 'Particular' | 'Trabajo';
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
  costUsd?: number | null;
  exchangeRate?: number | null;
  isRecurring?: boolean | null;
  recurrenceIntervalKm?: number | null;
  date: string; // Unified date for timeline
  lastNotificationSent?: string | null;
};

export type TripExpense = {
  description: string;
  amount: number;
};

export type Trip = {
    id: string;
    vehicleId: string;
    userId: string;
    username: string;
    tripType: string;
    destination: string;
    notes?: string;
    startDate: string; // ISO datetime string
    startOdometer: number;
    endDate?: string; // ISO datetime string
    endOdometer?: number;
    status: 'active' | 'completed';
    expenses?: TripExpense[];
    exchangeRate?: number;
};

export type ProcessedFuelLog = FuelLog & {
  distanceTraveled?: number;
  consumption?: number; // km/L
};

// This type is for client-side processing only
export type ProcessedServiceReminder = ServiceReminder & {
    kmsRemaining: number | null;
    daysRemaining: number | null;
    isUrgent: boolean;
    isOverdue: boolean;
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
  type: 'fuel' | 'service' | 'trip';
  date: string;
  data: ProcessedFuelLog | ProcessedServiceReminder | Trip;
};

    

    