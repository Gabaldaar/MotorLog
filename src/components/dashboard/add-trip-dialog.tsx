'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';

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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { toDateTimeLocalString } from '@/lib/utils';
import type { Trip, ConfigItem, User } from '@/lib/types';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';

const formSchema = z.object({
  tripType: z.string().min(1, 'El tipo de viaje es obligatorio.'),
  destination: z.string().min(1, 'El destino es obligatorio.'),
  notes: z.string().optional(),
  
  startDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Fecha de inicio inválida." }),
  startOdometer: z.coerce.number().min(1, 'El odómetro de inicio es obligatorio.'),

  status: z.enum(['active', 'completed']).default('active'),
  
  endDate: z.string().optional(),
  endOdometer: z.coerce.number().optional(),
}).refine(data => {
  if (data.status === 'completed') {
    return !!data.endDate && !isNaN(Date.parse(data.endDate)) && !!data.endOdometer;
  }
  return true;
}, {
  message: "La fecha y odómetro de fin son obligatorios para completar un viaje.",
  path: ["endDate"],
}).refine(data => {
    if (data.status === 'completed' && data.endOdometer) {
        return data.endOdometer >= data.startOdometer;
    }
    return true;
}, {
    message: "El odómetro final debe ser mayor o igual al inicial.",
    path: ["endOdometer"],
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
  const { toast } = useToast();
  const { user: authUser } = useUser();
  const firestore = useFirestore();
  const isEditing = !!trip;

  const userProfileRef = useMemoFirebase(() => {
    if (!authUser || !firestore) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);
  const { data: userProfile } = useDoc<User>(userProfileRef);
  
  const tripTypesQuery = useMemoFirebase(() => {
    if (!authUser || !firestore) return null;
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
        endOdometer: lastOdometer || 0,
    }
  });
  
  const { watch, reset, setValue } = form;
  const status = watch('status');

  useEffect(() => {
    if (open) {
      const now = toDateTimeLocalString(new Date());
      reset({
        tripType: trip?.tripType || '',
        destination: trip?.destination || '',
        notes: trip?.notes || '',
        startDate: trip ? toDateTimeLocalString(new Date(trip.startDate)) : now,
        startOdometer: trip?.startOdometer || lastOdometer || 0,
        status: trip?.status || 'active',
        endDate: trip?.endDate ? toDateTimeLocalString(new Date(trip.endDate)) : now,
        endOdometer: trip?.endOdometer || lastOdometer || 0,
      });
    }
  }, [open, trip, reset, lastOdometer]);
  
  useEffect(() => {
    if (status === 'completed' && (!form.getValues('endOdometer') || form.getValues('endOdometer') === trip?.startOdometer) && lastOdometer) {
      setValue('endOdometer', lastOdometer);
    }
  }, [status, lastOdometer, setValue, form, trip]);


  async function onSubmit(values: FormValues) {
    if (!authUser || !userProfile || !firestore) {
        toast({ variant: "destructive", title: "Error", description: "Debes iniciar sesión." });
        return;
    }
    setIsSubmitting(true);
    
    const tripId = isEditing ? trip.id : doc(collection(firestore, '_')).id;
    const tripRef = doc(firestore, 'vehicles', vehicleId, 'trips', tripId);
    
    const tripData: Partial<Trip> & { id: string, vehicleId: string, userId: string, startDate: string } = {
        id: tripId,
        vehicleId,
        userId: authUser.uid,
        tripType: values.tripType,
        destination: values.destination,
        notes: values.notes,
        startOdometer: values.startOdometer,
        status: values.status,
        startDate: new Date(values.startDate).toISOString(),
        ...(values.status === 'completed' && values.endDate && values.endOdometer && {
            endOdometer: values.endOdometer,
            endDate: new Date(values.endDate).toISOString(),
        }),
    };

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">{isEditing ? (trip.status === 'active' ? 'Finalizar' : 'Editar') : 'Iniciar Nuevo'} Viaje</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Completa o edita los detalles de tu viaje.' : 'Registra un nuevo viaje para tu vehículo.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             <div className="max-h-[65vh] overflow-y-auto pr-4 pl-1 -mr-4 -ml-1">
                <div className="space-y-4">
                  
                  {isEditing && (
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Finalizar Viaje</FormLabel>
                            <FormDescription>Marca el viaje como completado.</FormDescription>
                          </div>
                          <FormControl>
                            <Switch 
                              checked={field.value === 'completed'} 
                              onCheckedChange={(checked) => field.onChange(checked ? 'completed' : 'active')}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}

                  <Separator />
                  <p className="text-sm font-medium">{status === 'active' ? "Detalles de Inicio" : "Detalles del Viaje"}</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="tripType" render={({ field }) => (
                          <FormItem>
                          <FormLabel>Tipo de Viaje</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={status === 'completed'}>
                                  <FormControl><SelectTrigger disabled={isLoadingTripTypes}><SelectValue placeholder="Selecciona..." /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    {tripTypes?.map(type => <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>)}
                                  </SelectContent>
                              </Select>
                          <FormMessage />
                          </FormItem>
                      )} />
                       <FormField control={form.control} name="destination" render={({ field }) => (
                          <FormItem>
                          <FormLabel>Destino</FormLabel>
                          <FormControl><Input placeholder="e.g., Oficina" {...field} disabled={status === 'completed'} /></FormControl>
                          <FormMessage />
                          </FormItem>
                      )} />
                  </div>

                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea placeholder="Notas adicionales..." {...field} disabled={status === 'completed'} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="startOdometer" render={({ field }) => (
                          <FormItem><FormLabel>Odómetro Inicial</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} disabled={status === 'completed'} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="startDate" render={({ field }) => (
                          <FormItem><FormLabel>Fecha de Inicio</FormLabel><FormControl><Input type="datetime-local" {...field} disabled={status === 'completed'} /></FormControl><FormMessage /></FormItem>
                      )} />
                  </div>

                  {status === 'completed' && (
                    <div className="space-y-4 pt-4 border-t">
                      <p className="text-sm font-medium">Detalles de Fin</p>
                      <div className="grid grid-cols-2 gap-4">
                          <FormField control={form.control} name="endOdometer" render={({ field }) => (
                              <FormItem><FormLabel>Odómetro Final</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="endDate" render={({ field }) => (
                             <FormItem><FormLabel>Fecha de Fin</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                      </div>
                    </div>
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
