import type { Vehicle } from './types';

export interface CostPerKm {
  amortizationPerKm: number; // USD per Km
  fixedCostPerKm: number; // USD per Km
  fuelCostPerKm: number; // ARS per Km
}

/**
 * Calculates the different cost components per kilometer for a given vehicle.
 *
 * @param vehicle - The vehicle object with all its financial and usage data.
 * @param averageConsumptionKmPerLiter - The vehicle's average fuel consumption in km/L.
 * @param currentFuelPrice - The current price of fuel in ARS per liter.
 * @returns An object with the cost components per kilometer.
 */
export function calculateCostsPerKm(
  vehicle: Vehicle,
  averageConsumptionKmPerLiter: number,
  currentFuelPrice: number
): CostPerKm {
  
  // 1. Amortización del vehículo por Km (Am/Km) in USD
  let amortizationPerKm = 0;
  const {
    purchasePrice = 0,
    resaleValue = 0,
    kmPerYear = 0,
    usefulLifeYears = 0,
  } = vehicle;

  if (purchasePrice > 0 && kmPerYear > 0 && usefulLifeYears > 0) {
    const totalKmAmortization = kmPerYear * usefulLifeYears;
    amortizationPerKm = (purchasePrice - resaleValue) / totalKmAmortization;
  }

  // 2. Costo Fijo por kilometro (CF/Km) in USD
  let fixedCostPerKm = 0;
  const {
    annualInsuranceCost = 0,
    annualPatentCost = 0,
    maintenanceCost = 0,
    maintenanceKm = 0,
    tiresCost = 0,
    tiresKm = 0,
  } = vehicle;
  
  const insurancePerKm = kmPerYear > 0 ? annualInsuranceCost / kmPerYear : 0;
  const patentPerKm = kmPerYear > 0 ? annualPatentCost / kmPerYear : 0;
  const maintenancePerKm = maintenanceKm > 0 ? maintenanceCost / maintenanceKm : 0;
  const tiresPerKm = tiresKm > 0 ? tiresCost / tiresKm : 0;

  fixedCostPerKm = insurancePerKm + patentPerKm + maintenancePerKm + tiresPerKm;

  // 3. Costo de combustible por kilómetro (CC/Km) in ARS
  let fuelCostPerKm = 0;
  if (averageConsumptionKmPerLiter > 0 && currentFuelPrice > 0) {
    // Rendimiento en L/km es el inverso de km/L
    const litersPerKm = 1 / averageConsumptionKmPerLiter;
    fuelCostPerKm = litersPerKm * currentFuelPrice;
  }

  return {
    amortizationPerKm,
    fixedCostPerKm,
    fuelCostPerKm,
  };
}

/**
 * Calculates the total cost per KM in ARS using the provided exchange rate.
 * @param costs - The object containing cost components.
 * @param exchangeRate - The current USD to ARS exchange rate.
 * @returns The total cost per kilometer in ARS.
 */
export function calculateTotalCostInARS(costs: CostPerKm, exchangeRate: number): number {
    if (exchangeRate <= 0) return costs.fuelCostPerKm;

    const amortizationInARS = costs.amortizationPerKm * exchangeRate;
    const fixedCostInARS = costs.fixedCostPerKm * exchangeRate;
    
    return amortizationInARS + fixedCostInARS + costs.fuelCostPerKm;
}
