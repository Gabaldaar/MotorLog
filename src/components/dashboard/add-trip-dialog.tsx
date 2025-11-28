

'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Plus, Trash2, Wand2, Flag, Route, ChevronsRight } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { toDateTimeLocalString, parseCurrency, formatCurrency } from '@/lib/utils';
import type { Trip, ConfigItem, User, TripStage } from '@/lib/types';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';
import { Label } from '../ui/label';
import { getOfficialDolarRate } from '@/ai/flows/get-exchange-rate';

const expenseSchema = z.object({
  description: z.string().min(1, 'La descripción es obligatoria.'),
  amount: z.string().min(1, 'El monto debe ser positivo.'),
});

const stageSchema = z.object({
  id: z.string(),
  stageEndOdometer: z.coerce.number().min(1, 'El odómetro es obligatorio.'),
  stageEndDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Fecha inválida." }),
  notes: z.string().optional(),
  expenses: z.array(expenseSchema).optional(),
});

const formSchema = z.object({
  tripType: z.string().min(1, 'El tipo de viaje es obligatorio.'),
  destination: z.string().min(1, 'El destino es obligatorio.'),
  notes: z.string().optional(),
  
  startDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Fecha de inicio inválida." }),
  startOdometer: z.coerce.number().min(1, 'El odómetro de inicio es obligatorio.'),

  status: z.enum(['active', 'completed']).default('active'),
  stages: z.array(stageSchema).optional(),
  exchangeRate: z.string().optional(),
}).refine(data => {
    // Custom validation to ensure endOdometer of a stage is greater than the previous one
    if (data.stages && data.stages.length > 0) {
        let lastOdometer = data.startOdometer;
        for (const stage of data.stages) {
            if (stage.stageEndOdometer <= lastOdometer) {
                return false; // Fails validation
            }
            lastOdometer = stage.stageEndOdometer;
        }
    }
    return true;
}, {
    message: "El odómetro de una etapa debe ser mayor que el de la etapa anterior.",
    path: ["stages"],
});

type FormValues = z.infer<typeof formSchema>;

interface AddTripDialogProps {
  vehicleId: string;
  trip?: Trip;
  children: React.ReactNode;
  lastOdometer: number;
}

export default function AddTripDialog({ vehicleId, trip, children, lastOdometer }: AddTripDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [activeStage, setActiveStage] = useState<'new' | 'final' | null>(null);
  const { toast } = useToast();
  const { user: authUser } = useUser();
  const firestore = useFirestore();
  const isEditing = !!trip;
  
  const userProfileRef = useMemoFirebase(() => {
    if (!authUser) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);
  const { data: userProfile } = useDoc<User>(userProfileRef);
  
  const tripTypesQuery = useMemoFirebase(() => {
    if (!authUser) return null;
    return query(collection(firestore, 'trip_types'), orderBy('name'));
  }, [firestore, authUser]);
  const { data: tripTypes, isLoading: isLoadingTripTypes } = useCollection<ConfigItem>(tripTypesQuery);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        tripType: '',
        destination: '',
        notes: '',
        startOdometer: lastOdometer || 0,
        status: 'active',
        stages: [],
        exchangeRate: '',
    }
  });
  
  const { control, watch, reset, setValue, handleSubmit, trigger } = form;
  
  const { fields, append, remove } = useFieldArray({
    control,
    name: "stages",
  });

  const stages = watch('stages');
  const startOdometer = watch('startOdometer');
  
  const lastStageOdometer = stages && stages.length > 0 ? stages[stages.length - 1].stageEndOdometer : startOdometer;

  const handleFetchRate = async () => {
    setIsFetchingRate(true);
    try {
        const rateData = await getOfficialDolarRate();
        setValue('exchangeRate', rateData.rate.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { shouldValidate: true });
        toast({
            title: 'Cotización Obtenida',
            description: `Dólar Oficial (Vendedor): ${formatCurrency(rateData.rate)}`,
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
      const now = toDateTimeLocalString(new Date());
      const toLocaleString = (num: number | undefined) => num?.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '';

      const tripExchangeRate = trip?.exchangeRate;

      reset({
        tripType: trip?.tripType || '',
        destination: trip?.destination || '',
        notes: trip?.notes || '',
        startDate: trip ? toDateTimeLocalString(new Date(trip.startDate)) : now,
        startOdometer: trip?.startOdometer || lastOdometer || 0,
        status: trip?.status || 'active',
        stages: trip?.stages?.map(s => ({
            ...s,
            stageEndDate: toDateTimeLocalString(new Date(s.stageEndDate)),
            expenses: s.expenses?.map(e => ({description: e.description, amount: toLocaleString(e.amount)})) || []
        })) || [],
        exchangeRate: tripExchangeRate ? toLocaleString(tripExchangeRate) : '',
      });

      if (isEditing && (!tripExchangeRate || tripExchangeRate === 0)) {
        handleFetchRate();
      }

      setActiveStage(null);
    }
  }, [open, trip, reset, lastOdometer, isEditing, setValue]);
  
  const handleAddStage = async () => {
    const isFieldsValid = await trigger(["tripType", "destination", "startOdometer", "startDate"]);
    if (!isFieldsValid) {
        toast({
            variant: "destructive",
            title: "Faltan Datos",
            description: "Por favor completa los detalles iniciales del viaje antes de añadir una etapa.",
        });
        return;
    }
    const newStageId = doc(collection(firestore, '_')).id;
    append({
        id: newStageId,
        stageEndOdometer: lastStageOdometer,
        stageEndDate: toDateTimeLocalString(new Date()),
        notes: '',
        expenses: []
    });
    setActiveStage('new');
  };

  const handleFinalizeTrip = async () => {
    const isFieldsValid = await trigger(["tripType", "destination", "startOdometer", "startDate"]);
    if (!isFieldsValid) {
        toast({
            variant: "destructive",
            title: "Faltan Datos",
            description: "Por favor completa los detalles iniciales del viaje.",
        });
        return;
    }
    const newStageId = doc(collection(firestore, '_')).id;
     append({
        id: newStageId,
        stageEndOdometer: lastOdometer,
        stageEndDate: toDateTimeLocalString(new Date()),
        notes: 'Viaje finalizado.',
        expenses: []
    });
    setValue('status', 'completed');
    setActiveStage('final');
  }

  async function onSubmit(values: FormValues) {
    if (!authUser || !userProfile) {
        toast({ variant: "destructive", title: "Error", description: "Debes iniciar sesión." });
        return;
    }
    setIsSubmitting(true);
    
    const tripId = isEditing ? trip.id : doc(collection(firestore, '_')).id;
    const tripRef = doc(firestore, 'vehicles', vehicleId, 'trips', tripId);
    
    const tripData: Partial<Trip> & { id: string, vehicleId: string, userId: string, username: string, startDate: string } = {
        id: tripId,
        vehicleId,
        userId: authUser.uid,
        username: userProfile.username,
        tripType: values.tripType,
        destination: values.destination,
        notes: values.notes,
        startOdometer: values.startOdometer,
        status: values.status,
        stages: values.stages?.map(s => ({
            ...s,
            stageEndDate: new Date(s.stageEndDate).toISOString(),
            expenses: s.expenses?.map(e => ({description: e.description, amount: parseCurrency(e.amount)})) || []
        })) || [],
        startDate: new Date(values.startDate).toISOString(),
    };
    
    if (values.exchangeRate) {
        tripData.exchangeRate = parseCurrency(values.exchangeRate);
    } else {
        tripData.exchangeRate = undefined;
    }

    setDocumentNonBlocking(tripRef, tripData, { merge: true });

    toast({
      title: isEditing ? 'Viaje Actualizado' : 'Viaje Iniciado',
      description: `El viaje a ${values.destination} se ha guardado.`,
    });

    setIsSubmitting(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-headline">{isEditing ? (trip?.status === 'active' ? 'Editar Viaje Activo' : 'Editar Viaje') : 'Iniciar Nuevo'} Viaje</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Añade etapas o finaliza los detalles de tu viaje.' : 'Registra un nuevo viaje para tu vehículo.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
             <div className="max-h-[65vh] overflow-y-auto pr-4 pl-1 -mr-4 -ml-1">
                <div className="space-y-4">
                  <p className="text-sm font-medium">Detalles del Viaje</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <FormField control={control} name="tripType" render={({ field }) => (
                          <FormItem>
                          <FormLabel>Tipo de Viaje</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                  <FormControl><SelectTrigger disabled={isLoadingTripTypes}><SelectValue placeholder="Selecciona..." /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    {tripTypes?.map(type => <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>)}
                                  </SelectContent>
                              </Select>
                          <FormMessage />
                          </FormItem>
                      )} />
                       <FormField control={control} name="destination" render={({ field }) => (
                          <FormItem>
                          <FormLabel>Destino Final</FormLabel>
                          <FormControl><Input placeholder="e.g., Oficina" {...field} /></FormControl>
                          <FormMessage />
                          </FormItem>
                      )} />
                  </div>

                  <FormField control={control} name="notes" render={({ field }) => (
                    <FormItem><FormLabel>Notas Generales</FormLabel><FormControl><Textarea placeholder="Notas sobre el viaje completo..." {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                      <FormField control={control} name="startOdometer" render={({ field }) => (
                          <FormItem><FormLabel>Odómetro Inicial</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={control} name="startDate" render={({ field }) => (
                          <FormItem><FormLabel>Fecha de Inicio</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                  </div>
                  
                  <Separator />

                  <div className="space-y-4">
                    <Label>Etapas del Viaje</Label>
                     {fields.map((field, index) => {
                        const previousOdometer = index > 0 ? stages![index - 1].stageEndOdometer : startOdometer;
                         return (
                            <div key={field.id} className="p-4 border rounded-lg space-y-4 bg-muted/30">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-primary">Etapa {index + 1}</p>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                     <FormField control={control} name={`stages.${index}.stageEndOdometer`} render={({ field }) => (
                                        <FormItem><FormLabel>Odómetro Etapa</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormDescription className="text-xs">Anterior: {previousOdometer.toLocaleString()} km</FormDescription><FormMessage /></FormItem>
                                    )} />
                                     <FormField control={control} name={`stages.${index}.stageEndDate`} render={({ field }) => (
                                        <FormItem><FormLabel>Fecha Etapa</FormLabel><FormControl><Input type="datetime-local" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                 <FormField control={control} name={`stages.${index}.notes`} render={({ field }) => (
                                    <FormItem><FormLabel>Notas de la Etapa</FormLabel><FormControl><Textarea placeholder="Notas específicas para esta etapa..." {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <div>
                                    <Label>Gastos de la Etapa</Label>
                                    <StageExpenses stageIndex={index} />
                                </div>
                            </div>
                        )
                     })}
                     {(trip?.status !== 'completed' || fields.length === 0) && (
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button type="button" variant="secondary" className="w-full" onClick={handleAddStage}>
                                <ChevronsRight className="mr-2 h-4 w-4" /> Añadir Etapa
                            </Button>
                            <Button type="button" variant="default" className="w-full" onClick={handleFinalizeTrip}>
                                <Flag className="mr-2 h-4 w-4" /> Finalizar Viaje
                            </Button>
                        </div>
                     )}
                     {fields.length === 0 && trip?.status === 'active' && <p className="text-xs text-muted-foreground text-center">Añade etapas a tu viaje o finalízalo.</p>}

                  </div>

                  {isEditing && (
                    <>
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
                    </>
                  )}
              </div>
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Guardar Cambios' : 'Iniciar Viaje'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function StageExpenses({ stageIndex }: { stageIndex: number }) {
  const { control } = useFormContext<FormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `stages.${stageIndex}.expenses`
  });

  return (
    <div className="space-y-2 mt-2">
      {fields.map((field, expenseIndex) => (
        <div key={field.id} className="flex items-start gap-2">
          <FormField
            control={control}
            name={`stages.${stageIndex}.expenses.${expenseIndex}.description`}
            render={({ field }) => (
                <FormItem className="flex-1">
                    <FormControl><Input {...field} placeholder="Descripción (ej: Peaje)" /></FormControl>
                    <FormMessage className="text-xs" />
                </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`stages.${stageIndex}.expenses.${expenseIndex}.amount`}
            render={({ field }) => (
                <FormItem className="w-28">
                    <FormControl><Input {...field} type="text" placeholder="$" /></FormControl>
                    <FormMessage className="text-xs" />
                </FormItem>
            )}
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(expenseIndex)} className="shrink-0">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => append({ description: "", amount: '' })}
      >
        <Plus className="mr-2 h-4 w-4" />
        Gasto
      </Button>
    </div>
  );
}
