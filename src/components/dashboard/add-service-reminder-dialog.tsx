
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CalendarIcon, Loader2, Plus, Wrench, Repeat } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ServiceReminder, ConfigItem } from '@/lib/types';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { setDocumentNonBlocking, addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';
import { DialogTrigger } from '../ui/dialog';

const formSchema = z.object({
  serviceType: z.string().min(1, 'El tipo de servicio es obligatorio.'),
  notes: z.string().optional(),
  dueDate: z.date().optional(),
  dueOdometer: z.coerce.number().optional(),
  
  isRecurring: z.boolean().default(false),
  recurrenceIntervalKm: z.coerce.number().optional(),

  isCompleted: z.boolean().default(false),
  completedDate: z.date().optional(),
  completedOdometer: z.coerce.number().optional(),
  serviceLocation: z.string().optional(),
cost: z.coerce.number().optional(),
}).refine(data => data.isCompleted || data.dueDate || data.dueOdometer, {
  message: "Debes especificar al menos una fecha o un odómetro para el recordatorio.",
  path: ["dueDate"], 
}).refine(data => {
  if (data.isCompleted) {
    return data.completedDate && data.completedOdometer;
  }
  return true;
}, {
  message: "La fecha y el odómetro son obligatorios al completar un servicio.",
  path: ["completedDate"],
}).refine(data => {
  if (data.isRecurring) {
    return data.recurrenceIntervalKm && data.recurrenceIntervalKm > 0;
  }
  return true;
}, {
  message: "El intervalo de recurrencia es obligatorio.",
  path: ["recurrenceIntervalKm"],
});

type FormValues = z.infer<typeof formSchema>;

interface AddServiceReminderDialogProps {
  vehicleId: string;
  reminder?: ServiceReminder;
  children: React.ReactNode;
  lastOdometer?: number;
}

export default function AddServiceReminderDialog({ vehicleId, reminder, children, lastOdometer }: AddServiceReminderDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const isEditing = !!reminder;

  const serviceTypesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'service_types'), orderBy('name'));
  }, [firestore, user]);

  const { data: serviceTypes, isLoading: isLoadingServiceTypes } = useCollection<ConfigItem>(serviceTypesQuery);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });
  
  const { watch, reset, setValue } = form;
  const isCompleted = watch('isCompleted');
  const isRecurring = watch('isRecurring');

  useEffect(() => {
    if (open) {
      reset({
        serviceType: reminder?.serviceType || '',
        notes: reminder?.notes || '',
        dueDate: reminder?.dueDate ? new Date(reminder.dueDate) : undefined,
        dueOdometer: reminder?.dueOdometer || undefined,
        
        isRecurring: reminder?.isRecurring || false,
        recurrenceIntervalKm: reminder?.recurrenceIntervalKm || undefined,

        isCompleted: reminder?.isCompleted || false,
        completedDate: reminder?.completedDate ? new Date(reminder.completedDate) : new Date(),
        completedOdometer: reminder?.completedOdometer || lastOdometer || undefined,
        serviceLocation: reminder?.serviceLocation || '',
        cost: reminder?.cost || undefined,
      });
    }
  }, [open, reminder, reset, lastOdometer]);

  useEffect(() => {
    if(isCompleted && !form.getValues('completedOdometer') && lastOdometer){
      setValue('completedOdometer', lastOdometer)
    }
  }, [isCompleted, lastOdometer, form, setValue])


  async function onSubmit(values: FormValues) {
    if (!user) {
        toast({
            variant: "destructive",
            title: "Error",
            description: "Debes iniciar sesión para gestionar recordatorios."
        });
        return;
    }
    setIsSubmitting(true);
    
    const reminderId = isEditing ? reminder.id : doc(collection(firestore, '_')).id;
    const reminderRef = doc(firestore, 'vehicles', vehicleId, 'service_reminders', reminderId);
    
    let nextDueOdometerForRecurring: number | null = null;
    
    if (values.isCompleted && values.isRecurring && values.recurrenceIntervalKm && values.completedOdometer) {
        nextDueOdometerForRecurring = values.completedOdometer + values.recurrenceIntervalKm;
    }
    
    const dateForTimeline = values.completedDate ? values.completedDate.toISOString() : (values.dueDate ? values.dueDate.toISOString() : new Date().toISOString());

    const reminderData: Omit<ServiceReminder, 'dueDate' | 'completedDate'> & { dueDate: string | null; completedDate: string | null; dueOdometer: number | null; date: string; } = {
      id: reminderId,
      vehicleId,
      serviceType: values.serviceType,
      notes: values.notes || '',
      dueOdometer: nextDueOdometerForRecurring ? nextDueOdometerForRecurring : (values.dueOdometer || null),
      isCompleted: values.isCompleted,
      isRecurring: values.isRecurring,
      recurrenceIntervalKm: values.isRecurring ? values.recurrenceIntervalKm : null,
      completedOdometer: values.isCompleted ? values.completedOdometer : null,
      serviceLocation: values.isCompleted ? values.serviceLocation : null,
      cost: values.isCompleted ? values.cost : null,
      dueDate: values.dueDate ? values.dueDate.toISOString() : null,
      completedDate: (values.isCompleted && values.completedDate) ? values.completedDate.toISOString() : null,
      date: dateForTimeline
    };

    if (isEditing && values.isCompleted && values.isRecurring && values.recurrenceIntervalKm && values.completedOdometer) {
        const originalReminderRef = doc(firestore, 'vehicles', vehicleId, 'service_reminders', reminder.id);
        const completedData = {
          ...reminder,
          ...reminderData,
          isRecurring: false, // Mark original as non-recurring
          dueOdometer: reminder.dueOdometer,
        };
        setDocumentNonBlocking(originalReminderRef, completedData, { merge: true });

        const nextReminderId = doc(collection(firestore, '_')).id;
        const nextReminderRef = doc(firestore, 'vehicles', vehicleId, 'service_reminders', nextReminderId);
        const newReminderData = {
            ...reminderData,
            id: nextReminderId,
            isCompleted: false,
            completedDate: null,
            completedOdometer: null,
            cost: null,
            serviceLocation: null,
            dueDate: null, // Reset due date for next one, it's odometer based
            dueOdometer: values.completedOdometer + values.recurrenceIntervalKm,
        };
        setDocumentNonBlocking(nextReminderRef, newReminderData, { merge: true });
        toast({
            title: '¡Servicio Recurrente!',
            description: `Se ha creado un nuevo recordatorio para los ${(values.completedOdometer + values.recurrenceIntervalKm).toLocaleString()} km.`,
        });

    } else {
        setDocumentNonBlocking(reminderRef, reminderData, { merge: true });
    }

    toast({
      title: isEditing ? 'Recordatorio Actualizado' : 'Recordatorio Creado',
      description: `El servicio "${values.serviceType}" ha sido guardado.`,
    });

    setIsSubmitting(false);
    setOpen(false);
    if (!isEditing) {
      form.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">{isEditing ? 'Editar' : 'Nuevo'} Recordatorio de Servicio</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Actualiza los detalles y el estado de este recordatorio.' : 'Añade un nuevo recordatorio de mantenimiento.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             <div className="max-h-[65vh] overflow-y-auto pr-4 pl-1 -mr-4 -ml-1">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="serviceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Servicio</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                              <FormControl>
                              <SelectTrigger disabled={isLoadingServiceTypes}>
                                  <SelectValue placeholder={isLoadingServiceTypes ? "Cargando..." : "Selecciona un tipo"} />
                              </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {serviceTypes?.map(serviceType => (
                                  <SelectItem key={serviceType.id} value={serviceType.name}>{serviceType.name}</SelectItem>
                                ))}
                              </SelectContent>
                          </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                          <FormItem className="flex flex-col">
                              <FormLabel>Fecha Límite</FormLabel>
                              <Popover>
                                  <PopoverTrigger asChild>
                                  <FormControl>
                                      <Button
                                      variant={"outline"}
                                      className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                      >
                                      {field.value ? (format(field.value, "PPP", { locale: es })) : (<span>Elige una fecha</span>)}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                  </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                  </PopoverContent>
                              </Popover>
                              <FormMessage />
                          </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dueOdometer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Odómetro Límite (km)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g., 30000" {...field} value={field.value ?? ''}/>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas (Opcional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., Usar aceite sintético 5W-30." {...field} value={field.value ?? ''}/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isRecurring"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel className="flex items-center"><Repeat className="mr-2 h-4 w-4"/>Servicio Recurrente</FormLabel>
                          <FormDescription>Repetir al completar.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {isRecurring && (
                      <div className="pl-4 ml-4 border-l-2">
                        <FormField
                            control={form.control}
                            name="recurrenceIntervalKm"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Repetir cada (km)</FormLabel>
                                <FormControl>
                                <Input type="number" placeholder="e.g., 10000" {...field} value={field.value ?? ''}/>
                                </FormControl>
                                <FormDescription>El próximo servicio se programará a partir del odómetro de completado.</FormDescription>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    </div>
                  )}
                  
                  <Separator />

                  <FormField
                    control={form.control}
                    name="isCompleted"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Marcar como Completado</FormLabel>
                          <FormDescription>Registra la finalización del servicio.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {isCompleted && (
                    <div className="space-y-4 p-4 border rounded-md bg-muted/20">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="completedOdometer"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Odómetro Real</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="Odómetro al completar" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="completedDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Fecha Real</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn("pl-3 text-left font-normal",!field.value && "text-muted-foreground")}>
                                      {field.value ? (format(field.value, "PPP", { locale: es })) : (<span>Elige una fecha</span>)}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                       <FormField
                        control={form.control}
                        name="cost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Costo del Servicio (Opcional)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="$" {...field} value={field.value ?? ''}/>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="serviceLocation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lugar del Servicio (Opcional)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Taller Mecánico Pepe" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
              </div>
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Guardar Cambios' : 'Añadir Recordatorio'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
