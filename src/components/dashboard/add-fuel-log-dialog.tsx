
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CalendarIcon, Plus, Loader2, Search, Check, ChevronsUpDown, Wand2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDate, parseCurrency } from '@/lib/utils';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, query, orderBy } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { FuelLog, User, Vehicle, ConfigItem } from '@/lib/types';
import FindNearbyGasStationsDialog from '../ai/find-nearby-gas-stations-dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Separator } from '../ui/separator';
import { getDolarBlueRate } from '@/ai/flows/get-exchange-rate';


const formSchema = z.object({
  date: z.date({
    required_error: 'La fecha es obligatoria.',
  }),
  odometer: z.coerce.number().min(1, 'El odómetro es obligatorio.'),
  totalCost: z.string().min(1, 'El costo total es obligatorio.'),
  liters: z.string().min(1, 'La cantidad de litros es obligatoria.'),
  pricePerLiter: z.string().min(1, 'El precio por litro es obligatorio.'),
  fuelType: z.string({
    required_error: 'El tipo de combustible es obligatorio.',
  }),
  isFillUp: z.boolean().default(true),
  gasStation: z.string().optional(),
  missedPreviousFillUp: z.boolean().default(false),
  exchangeRate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type LastEditedField = 'totalCost' | 'liters' | 'pricePerLiter' | null;

interface AddFuelLogDialogProps {
    vehicleId: string;
    lastLog?: FuelLog;
    fuelLog?: Partial<FuelLog>;
    children?: React.ReactNode;
    vehicle?: Vehicle;
}

export default function AddFuelLogDialog({ vehicleId, lastLog, fuelLog, vehicle, children }: AddFuelLogDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [lastEdited, setLastEdited] = useState<LastEditedField>(null);
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [isFetchingRate, setIsFetchingRate] = useState(false);


  const { user: authUser } = useUser();
  const firestore = useFirestore();
  const isEditing = !!fuelLog?.id;

  const userProfileRef = useMemoFirebase(() => {
    if (!authUser) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);

  const { data: userProfile } = useDoc<User>(userProfileRef);

  const fuelTypesQuery = useMemoFirebase(() => {
    if (!authUser) return null;
    return query(collection(firestore, 'fuel_types'), orderBy('name'));
  }, [firestore, authUser]);
  
  const gasStationsQuery = useMemoFirebase(() => {
    if (!authUser) return null;
    return query(collection(firestore, 'gas_stations'), orderBy('name'));
  }, [firestore, authUser]);

  const { data: fuelTypes, isLoading: isLoadingFuelTypes } = useCollection<ConfigItem>(fuelTypesQuery);
  const { data: gasStations, isLoading: isLoadingGasStations } = useCollection<ConfigItem>(gasStationsQuery);


  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      odometer: undefined,
      totalCost: '',
      liters: '',
      pricePerLiter: '',
      fuelType: vehicle?.defaultFuelType,
      isFillUp: true,
      gasStation: '',
      missedPreviousFillUp: false,
      exchangeRate: '',
    },
  });

  const { watch, setValue, trigger } = form;
  const watchedValues = watch();
  
  const handleFetchRate = async () => {
    setIsFetchingRate(true);
    try {
        const rate = await getDolarBlueRate();
        setValue('exchangeRate', rate.average.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { shouldValidate: true });
        toast({
            title: 'Cotización Obtenida',
            description: `Dólar (Promedio): ${rate.average}`,
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
  };

  useEffect(() => {
    if (open) {
        const toLocaleString = (num: number | undefined) => num?.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '';

        const defaultVals = {
        date: fuelLog?.date ? new Date(fuelLog.date) : new Date(),
        odometer: fuelLog?.odometer,
        totalCost: toLocaleString(fuelLog?.totalCost),
        liters: toLocaleString(fuelLog?.liters),
        pricePerLiter: toLocaleString(fuelLog?.pricePerLiter),
        fuelType: fuelLog?.fuelType || vehicle?.defaultFuelType,
        isFillUp: fuelLog?.isFillUp !== undefined ? fuelLog.isFillUp : true,
        gasStation: fuelLog?.gasStation || '',
        missedPreviousFillUp: fuelLog?.missedPreviousFillUp || false,
        exchangeRate: toLocaleString(fuelLog?.exchangeRate),
        };
        form.reset(defaultVals);
        
        // Auto-fetch rate for new logs only
        if (!isEditing) {
            handleFetchRate();
        }
    }
  }, [fuelLog, open, form, vehicle, isEditing]);


  useEffect(() => {
    const { totalCost, liters, pricePerLiter } = watchedValues;
    if (!lastEdited) return;

    const cost = parseCurrency(totalCost);
    const ltrs = parseCurrency(liters);
    const price = parseCurrency(pricePerLiter);

    const format = (num: number) => num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (lastEdited !== 'pricePerLiter' && cost > 0 && ltrs > 0) {
      const newPrice = cost / ltrs;
      setValue('pricePerLiter', format(newPrice), { shouldValidate: true });
    } else if (lastEdited !== 'liters' && cost > 0 && price > 0) {
      const newLiters = cost / price;
      setValue('liters', format(newLiters), { shouldValidate: true });
    } else if (lastEdited !== 'totalCost' && ltrs > 0 && price > 0) {
      const newCost = ltrs * price;
      setValue('totalCost', format(newCost), { shouldValidate: true });
    }
  }, [watchedValues.totalCost, watchedValues.liters, watchedValues.pricePerLiter, lastEdited, setValue]);


  async function onSubmit(values: FormValues) {
    if (!authUser || !userProfile) {
        toast({
            variant: "destructive",
            title: "Error",
            description: "Debes iniciar sesión para añadir un registro."
        });
        return;
    }
    
    if (lastLog && !isEditing) { // Only validate for new entries
      const newDate = values.date.getTime();
      const lastDate = new Date(lastLog.date).getTime();
      const newOdometer = values.odometer;
      const lastOdometer = lastLog.odometer;

      if (newDate < lastDate && newOdometer > lastOdometer) {
        form.setError("date", { message: "La fecha no puede ser anterior al último registro si el odómetro es mayor."});
        form.setError("odometer", { message: "El odómetro no puede ser mayor si la fecha es anterior."});
        return;
      }
      if (newDate > lastDate && newOdometer < lastOdometer) {
        form.setError("date", { message: "La fecha no puede ser posterior al último registro si el odómetro es menor."});
        form.setError("odometer", { message: "El odómetro no puede ser menor si la fecha es posterior."});
        return;
      }
    }

    setIsSubmitting(true);
    
    const logId = isEditing ? fuelLog!.id! : doc(collection(firestore, '_')).id;
    const fuelLogRef = doc(firestore, 'vehicles', vehicleId, 'fuel_records', logId);

    const totalCostNum = parseCurrency(values.totalCost);
    const pricePerLiterNum = parseCurrency(values.pricePerLiter);
    const exchangeRateNum = values.exchangeRate ? parseCurrency(values.exchangeRate) : 0;

    let totalCostUsd: number | undefined;
    let pricePerLiterUsd: number | undefined;
    if (exchangeRateNum > 0) {
        totalCostUsd = totalCostNum / exchangeRateNum;
        pricePerLiterUsd = pricePerLiterNum / exchangeRateNum;
    }

    const fuelLogData = {
        ...values,
        id: logId,
        date: values.date.toISOString(),
        vehicleId,
        userId: authUser.uid,
        username: userProfile.username || authUser.email || 'Usuario',
        gasStation: values.gasStation || '',
        totalCost: totalCostNum,
        liters: parseCurrency(values.liters),
        pricePerLiter: pricePerLiterNum,
        exchangeRate: exchangeRateNum > 0 ? exchangeRateNum : undefined,
        totalCostUsd,
        pricePerLiterUsd,
    };

    setDocumentNonBlocking(fuelLogRef, fuelLogData, { merge: true });

    toast({
      title: isEditing ? 'Registro Actualizado' : 'Registro Añadido',
      description: 'La recarga de combustible se ha guardado correctamente.',
    });
    setIsSubmitting(false);
    setOpen(false);
  }

  const handleGasStationSelect = (name: string) => {
    setValue('gasStation', name, { shouldValidate: true });
    setPopoverOpen(false);
  };

  const handleNearbyGasStationSelect = (name: string) => {
    setValue('gasStation', name, { shouldValidate: true });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ? children : (
            <Button>
                <Plus className="-ml-1 mr-2 h-4 w-4" />
                Añadir Recarga
            </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">{isEditing ? 'Editar': 'Nueva'} Recarga de Combustible</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Actualiza los detalles de tu recarga.' : 'Añade los detalles de tu última recarga.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             <div className="max-h-[65vh] overflow-y-auto pr-4 pl-1 -mr-4 -ml-1">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                        control={form.control}
                        name="odometer"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Odómetro (km)</FormLabel>
                            <FormControl>
                                <Input type="number" placeholder="e.g., 25142" {...field} value={field.value ?? ''} />
                            </FormControl>
                            {lastLog && <FormDescription>Último: {lastLog.odometer} km</FormDescription>}
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                            <FormItem className="flex flex-col pt-2">
                                <FormLabel>Fecha</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                        variant={"outline"}
                                        className={cn(
                                            "pl-3 text-left font-normal",
                                            !field.value && "text-muted-foreground"
                                        )}
                                        >
                                        {field.value ? (
                                            format(field.value, "PPP", { locale: es })
                                        ) : (
                                            <span>Elige una fecha</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        disabled={(date) =>
                                        date > new Date() || date < new Date("1900-01-01")
                                        }
                                        initialFocus
                                    />
                                    </PopoverContent>
                                </Popover>
                                {lastLog && <FormDescription>Última: {formatDate(lastLog.date)}</FormDescription>}
                                <FormMessage />
                            </FormItem>
                        )}
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                    <FormField
                        control={form.control}
                        name="totalCost"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Costo Total (ARS)</FormLabel>
                            <FormControl>
                            <Input type="text" placeholder="$" {...field} value={field.value ?? ''} onChange={(e) => { field.onChange(e); setLastEdited('totalCost'); }}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="pricePerLiter"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>$/Litro (ARS)</FormLabel>
                            <FormControl>
                            <Input type="text" placeholder="$" {...field} value={field.value ?? ''} onChange={(e) => { field.onChange(e); setLastEdited('pricePerLiter'); }}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="liters"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Litros</FormLabel>
                            <FormControl>
                            <Input type="text" placeholder="L" {...field} value={field.value ?? ''} onChange={(e) => { field.onChange(e); setLastEdited('liters'); }}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                        control={form.control}
                        name="fuelType"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Tipo de Combustible</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                <FormControl>
                                <SelectTrigger disabled={isLoadingFuelTypes}>
                                    <SelectValue placeholder={isLoadingFuelTypes ? "Cargando..." : "Selecciona un tipo"} />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                {fuelTypes?.map(fuelType => (
                                    <SelectItem key={fuelType.id} value={fuelType.name}>{fuelType.name}</SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                        control={form.control}
                        name="gasStation"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Gasolinera</FormLabel>
                            <div className="flex flex-wrap items-center gap-2">
                                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className={cn("w-full justify-between flex-1 min-w-[150px]", !field.value && "text-muted-foreground")}
                                    >
                                        {field.value || (isLoadingGasStations ? "Cargando..." : "Seleccionar o escribir")}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                    <Command>
                                    <CommandInput 
                                        placeholder="Buscar o crear gasolinera..." 
                                        onValueChange={(value) => field.onChange(value)}
                                    />
                                    <CommandList>
                                        <CommandEmpty>No se encontró. Puedes crearla.</CommandEmpty>
                                        <CommandGroup>
                                        {gasStations?.map((station) => (
                                            <CommandItem
                                            value={station.name}
                                            key={station.id}
                                            onSelect={() => {
                                                handleGasStationSelect(station.name);
                                            }}
                                            >
                                            <Check className={cn("mr-2 h-4 w-4", station.name === field.value ? "opacity-100" : "opacity-0")} />
                                            {station.name}
                                            </CommandItem>
                                        ))}
                                        </CommandGroup>
                                    </CommandList>
                                    </Command>
                                </PopoverContent>
                                </Popover>
                                <FindNearbyGasStationsDialog onStationSelect={handleNearbyGasStationSelect}>
                                    <Button type="button" variant="outline" size="icon" className="shrink-0">
                                        <Search className="h-4 w-4" />
                                        <span className="sr-only">Buscar gasolineras cercanas</span>
                                    </Button>
                                </FindNearbyGasStationsDialog>
                            </div>
                            <FormMessage />
                        </FormItem>
                        )}
                        />
                    </div>

                    <FormField
                    control={form.control}
                    name="isFillUp"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                            <FormLabel>¿Llenado completo?</FormLabel>
                            <FormDescription>
                            Marca esto si llenaste el tanque.
                            </FormDescription>
                        </div>
                        <FormControl>
                            <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            />
                        </FormControl>
                        </FormItem>
                    )}
                    />

                    <FormField
                    control={form.control}
                    name="missedPreviousFillUp"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                            <FormLabel>¿Omitiste una recarga anterior?</FormLabel>
                            <FormDescription>
                            Esto invalidará el cálculo de consumo para este registro.
                            </FormDescription>
                        </div>
                        <FormControl>
                            <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            />
                        </FormControl>
                        </FormItem>
                    )}
                    />

                    <Separator />

                    <FormField
                        control={form.control}
                        name="exchangeRate"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tipo de Cambio (Opcional)</FormLabel>
                             <div className="flex items-center gap-2">
                                <FormControl>
                                <Input type="text" placeholder="1 USD = ??? ARS" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <Button type="button" variant="outline" size="icon" onClick={handleFetchRate} disabled={isFetchingRate}>
                                    {isFetchingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                    <span className="sr-only">Obtener cotización actual</span>
                                </Button>
                            </div>
                            <FormDescription>
                                Ingresa el tipo de cambio a dólar del día del gasto para un cálculo preciso del costo real.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
            </div>
           
            <DialogFooter className="pt-4 border-t">
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Guardar Cambios' : 'Guardar Registro'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

