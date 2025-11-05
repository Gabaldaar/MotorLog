
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CalendarIcon, Plus, Loader2 } from 'lucide-react';
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
import { cn, formatDate } from '@/lib/utils';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { addDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { FuelLog, User, Vehicle } from '@/lib/types';

const formSchema = z.object({
  date: z.date({
    required_error: 'La fecha es obligatoria.',
  }),
  odometer: z.coerce.number().min(1, 'El odómetro es obligatorio.'),
  totalCost: z.coerce.number().min(0.01, 'El costo total es obligatorio.'),
  liters: z.coerce.number().min(0.01, 'La cantidad de litros es obligatoria.'),
  pricePerLiter: z.coerce.number().min(0.01, 'El precio por litro es obligatorio.'),
  fuelType: z.enum(['Gasolina', 'Diesel', 'Etanol'], {
    required_error: 'El tipo de combustible es obligatorio.',
  }),
  isFillUp: z.boolean().default(true),
  gasStation: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type LastEditedField = 'totalCost' | 'liters' | 'pricePerLiter' | null;

interface AddFuelLogDialogProps {
    vehicleId: string;
    lastLog?: FuelLog;
    fuelLog?: FuelLog;
    children?: React.ReactNode;
    vehicle?: Vehicle;
}

export default function AddFuelLogDialog({ vehicleId, lastLog, fuelLog, vehicle, children }: AddFuelLogDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [lastEdited, setLastEdited] = useState<LastEditedField>(null);

  const { user: authUser } = useUser();
  const firestore = useFirestore();
  const isEditing = !!fuelLog;

  const userProfileRef = useMemoFirebase(() => {
    if (!authUser) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);

  const { data: userProfile } = useDoc<User>(userProfileRef);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      odometer: undefined,
      totalCost: undefined,
      liters: undefined,
      pricePerLiter: undefined,
      fuelType: vehicle?.defaultFuelType || 'Gasolina',
      isFillUp: true,
      gasStation: '',
    },
  });

  const { watch, setValue, trigger } = form;
  const watchedValues = watch();

  useEffect(() => {
    const defaultVals = {
      date: isEditing && fuelLog ? new Date(fuelLog.date) : new Date(),
      odometer: isEditing && fuelLog ? fuelLog.odometer : undefined,
      totalCost: isEditing && fuelLog ? fuelLog.totalCost : undefined,
      liters: isEditing && fuelLog ? fuelLog.liters : undefined,
      pricePerLiter: isEditing && fuelLog ? fuelLog.pricePerLiter : undefined,
      fuelType: (isEditing && fuelLog?.fuelType) || vehicle?.defaultFuelType || 'Gasolina',
      isFillUp: isEditing && fuelLog ? fuelLog.isFillUp : true,
      gasStation: isEditing && fuelLog ? fuelLog.gasStation : '',
    };
    form.reset(defaultVals);
  }, [fuelLog, isEditing, form, open, vehicle]);


  useEffect(() => {
    const { totalCost, liters, pricePerLiter } = watchedValues;
    if (!lastEdited) return;

    const cost = totalCost ? Number(totalCost) : 0;
    const ltrs = liters ? Number(liters) : 0;
    const price = pricePerLiter ? Number(pricePerLiter) : 0;

    if (lastEdited !== 'pricePerLiter' && cost > 0 && ltrs > 0) {
      const newPrice = cost / ltrs;
      setValue('pricePerLiter', parseFloat(newPrice.toFixed(2)), { shouldValidate: true });
    } else if (lastEdited !== 'liters' && cost > 0 && price > 0) {
      const newLiters = cost / price;
      setValue('liters', parseFloat(newLiters.toFixed(2)), { shouldValidate: true });
    } else if (lastEdited !== 'totalCost' && ltrs > 0 && price > 0) {
      const newCost = ltrs * price;
      setValue('totalCost', parseFloat(newCost.toFixed(2)), { shouldValidate: true });
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
    
    const logId = isEditing ? fuelLog.id : doc(collection(firestore, '_')).id;
    const fuelLogRef = doc(firestore, 'vehicles', vehicleId, 'fuel_records', logId);

    const fuelLogData = {
        ...values,
        id: logId,
        date: values.date.toISOString(),
        vehicleId,
        userId: authUser.uid,
        username: userProfile.username || authUser.email || 'Usuario',
        gasStation: values.gasStation || ''
    };

    setDocumentNonBlocking(fuelLogRef, fuelLogData, { merge: true });

    toast({
      title: isEditing ? 'Registro Actualizado' : 'Registro Añadido',
      description: 'El registro de combustible se ha guardado correctamente.',
    });
    setIsSubmitting(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ? children : (
            <Button>
                <Plus className="-ml-1 mr-2 h-4 w-4" />
                Añadir Repostaje
            </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">{isEditing ? 'Editar': 'Nuevo'} Registro de Combustible</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Actualiza los detalles de tu repostaje.' : 'Añade los detalles de tu último repostaje.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    <FormLabel>Costo Total</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="$" {...field} value={field.value ?? ''} onChange={(e) => { field.onChange(e); setLastEdited('totalCost'); }}/>
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
                    <FormLabel>$/Litro</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="$" {...field} value={field.value ?? ''} onChange={(e) => { field.onChange(e); setLastEdited('pricePerLiter'); }}/>
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
                      <Input type="number" step="0.01" placeholder="L" {...field} value={field.value ?? ''} onChange={(e) => { field.onChange(e); setLastEdited('liters'); }}/>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona un tipo" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        <SelectItem value="Gasolina">Gasolina</SelectItem>
                        <SelectItem value="Diesel">Diesel</SelectItem>
                        <SelectItem value="Etanol">Etanol</SelectItem>
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
                    <FormLabel>Gasolinera (Opcional)</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., Shell" {...field} value={field.value ?? ''} />
                    </FormControl>
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
           
            <DialogFooter>
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
