'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Wand2, Calculator, Fuel, TrendingUp, Wallet, Sparkles, DollarSign } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { parseCurrency, formatCurrency } from '@/lib/utils';
import type { Vehicle, ProcessedFuelLog } from '@/lib/types';
import { getOfficialDolarRate } from '@/ai/flows/get-exchange-rate';
import { calculateCostsPerKm, calculateTotalCostInARS } from '@/lib/cost-calculator';
import { Separator } from '../ui/separator';
import { useVehicles } from '@/context/vehicle-context';

const formSchema = z.object({
  kilometers: z.coerce.number().min(1, 'Los kilómetros son obligatorios.'),
  otherExpenses: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CalculationResult {
    fuelCostPerKm: number;
    vehicleCostPerKm: number;
    totalCostPerKm: number | null;
    fuelCostForTrip: number;
    vehicleCostForTrip: number;
    totalVehicleCostForTrip: number | null;
    finalFuelCost: number;
    finalTotalCost: number | null;
    kmTraveled: number;
}


interface TripCalculatorDialogProps {
    children: React.ReactNode;
    allFuelLogs: ProcessedFuelLog[];
}

export default function TripCalculatorDialog({ children, allFuelLogs }: TripCalculatorDialogProps) {
  const [open, setOpen] = useState(false);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const { toast } = useToast();
  const { selectedVehicle: vehicle } = useVehicles();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kilometers: undefined,
      otherExpenses: '',
    },
  });

  const lastFuelLog = useMemo(() => {
    if (!allFuelLogs || allFuelLogs.length === 0) return null;
    return [...allFuelLogs].sort((a,b) => b.odometer - a.odometer)[0];
  }, [allFuelLogs]);

  const handleFetchRate = async () => {
    setIsFetchingRate(true);
    let rateValue = null;
    try {
        const rateData = await getOfficialDolarRate();
        rateValue = rateData.rate;
        setExchangeRate(rateValue);
        toast({
            title: 'Cotización Obtenida',
            description: `1 USD = ${formatCurrency(rateValue)} ARS`,
        });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error al obtener cotización',
            description: error.message,
        });
    } finally {
        setIsFetchingRate(false);
    }
    return rateValue;
  };

  async function onSubmit(values: FormValues) {
    setIsCalculating(true);
    setCalculationResult(null);
    if (!vehicle) {
        toast({ variant: 'destructive', title: 'Error', description: 'No hay un vehículo seleccionado.'});
        setIsCalculating(false);
        return;
    }
    
    let currentExchangeRate = exchangeRate;
    if (currentExchangeRate === null || currentExchangeRate <= 0) {
        currentExchangeRate = await handleFetchRate();
    }

    if (currentExchangeRate === null) {
      toast({ variant: 'destructive', title: 'Cálculo incompleto', description: 'No se pudo obtener el tipo de cambio. Intenta ingresarlo manualmente.'});
      setIsCalculating(false);
      return;
    }

    const fallbackConsumption = vehicle.averageConsumptionKmPerLiter > 0 ? vehicle.averageConsumptionKmPerLiter : 1;
    const lastPricePerLiter = lastFuelLog?.pricePerLiter || 0;

    const costsPerKm = calculateCostsPerKm(vehicle, fallbackConsumption, lastPricePerLiter);
    const detailedCostsARS = currentExchangeRate ? calculateTotalCostInARS(costsPerKm, currentExchangeRate) : null;
    
    const otherExpensesNum = parseCurrency(values.otherExpenses || '0');

    const fuelCostForTrip = values.kilometers * (detailedCostsARS?.fuelCostPerKm_ARS || 0);
    const vehicleCostForTrip = values.kilometers * (detailedCostsARS?.vehicleCostPerKm_ARS || 0);
    
    const finalFuelCost = fuelCostForTrip + otherExpensesNum;
    const finalTotalCost = (fuelCostForTrip + vehicleCostForTrip) + otherExpensesNum;

    setCalculationResult({
        fuelCostPerKm: detailedCostsARS?.fuelCostPerKm_ARS || 0,
        vehicleCostPerKm: detailedCostsARS?.vehicleCostPerKm_ARS || 0,
        totalCostPerKm: detailedCostsARS?.totalCostPerKm_ARS || null,
        fuelCostForTrip: fuelCostForTrip,
        vehicleCostForTrip: vehicleCostForTrip,
        totalVehicleCostForTrip: null, // This field seems unused now
        finalFuelCost,
        finalTotalCost,
        kmTraveled: values.kilometers,
    });
    setIsCalculating(false);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        form.reset();
        setCalculationResult(null);
        setExchangeRate(null);
      }
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center gap-2"><Calculator /> Calculadora de Viajes</DialogTitle>
          <DialogDescription>
            Estima el costo de un viaje ingresando la distancia y otros gastos.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-4 pl-1 -mr-4 -ml-1">
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-4">
                    <FormField
                        control={form.control}
                        name="kilometers"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Distancia a Recorrer (Km)</FormLabel>
                            <FormControl>
                                <Input type="number" placeholder="Ej: 350" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="otherExpenses"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Otros Gastos (ARS - Opcional)</FormLabel>
                            <FormControl>
                                <Input type="text" placeholder="Ej: Peajes, estacionamiento" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    <div className="space-y-2">
                        <FormLabel>Tipo de Cambio (Opcional)</FormLabel>
                        <div className="flex items-center gap-2">
                            <Input 
                                type="text" 
                                placeholder="... o ingresa un valor"
                                value={exchangeRate !== null ? exchangeRate.toLocaleString('es-AR') : ''}
                                onChange={(e) => setExchangeRate(parseCurrency(e.target.value))}
                                className="h-9"
                            />
                            <Button type="button" onClick={handleFetchRate} disabled={isFetchingRate} variant="outline" size="icon">
                                {isFetchingRate ? <Loader2 className="h-4 w-4 animate-spin"/> : <Wand2 className="h-4 w-4" />}
                                <span className="sr-only">Obtener tipo de cambio</span>
                            </Button>
                        </div>
                        <FormDescription className="text-xs">Para calcular el costo total real del vehículo.</FormDescription>
                    </div>
                </div>

                <DialogFooter className="pt-4 border-t !mt-6 !flex-row !justify-between">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
                    <Button type="submit" disabled={isCalculating}>
                        {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Calculator className="mr-2 h-4 w-4" />}
                        Calcular
                    </Button>
                </DialogFooter>
            </form>
            </Form>

            {calculationResult && (
                <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Resultado de la Estimación</h3>
                    
                    <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                            <p className="font-semibold text-sm flex items-center gap-2"><Fuel className="h-4 w-4"/>Costos de Combustible</p>
                            <div className="flex justify-between items-baseline text-sm">
                                <span className="text-muted-foreground">Costo/km:</span>
                                <span className="font-medium">{formatCurrency(calculationResult.fuelCostPerKm)}</span>
                            </div>
                            <div className="flex justify-between items-baseline text-sm">
                                <span className="text-muted-foreground">Total ({calculationResult.kmTraveled.toLocaleString()} km):</span>
                                <span className="font-medium">{formatCurrency(calculationResult.fuelCostForTrip)}</span>
                            </div>
                        </div>

                        {calculationResult.totalCostPerKm !== null && (
                            <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                                <p className="font-semibold text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4"/>Costo del Vehículo (Amort. y Fijos)</p>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">Costo/km:</span>
                                    <span className="font-medium">{formatCurrency(calculationResult.vehicleCostPerKm)}</span>
                                </div>
                                <div className="flex justify-between items-baseline text-sm">
                                    <span className="text-muted-foreground">Total ({calculationResult.kmTraveled.toLocaleString()} km):</span>
                                    <span className="font-medium">{formatCurrency(calculationResult.vehicleCostForTrip)}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <Separator />
                    
                    <div className="space-y-4">
                        <p className="font-semibold text-sm">Costo Final Estimado del Viaje</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 rounded-lg border">
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Wallet className="h-3 w-3" />Combustible + Otros Gastos</p>
                                <p className="font-semibold text-lg">{formatCurrency(calculationResult.finalFuelCost)}</p>
                            </div>
                            {calculationResult.finalTotalCost !== null ? (
                                <div className="p-3 rounded-lg border border-primary/50 bg-primary/10">
                                    <p className="text-xs text-primary/80 flex items-center gap-1.5"><DollarSign className="h-3 w-3" />Costo Total Real del Viaje</p>
                                    <p className="font-semibold text-lg text-primary">{formatCurrency(calculationResult.finalTotalCost)}</p>
                                </div>
                            ) : (
                                <div className="p-3 rounded-lg border border-dashed text-center flex items-center justify-center">
                                    <p className="text-xs text-muted-foreground">Ingresa el tipo de cambio para ver el costo total real.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
