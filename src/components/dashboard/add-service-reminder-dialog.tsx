
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CalendarIcon, Loader2, Plus, Wrench } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ServiceReminder, ConfigItem } from '@/lib/types';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';

const formSchema = z.object({
  serviceType: z.string().min(1, 'El tipo de servicio es obligatorio.'),
  notes: z.string().optional(),
  dueDate: z.date().optional(),
  dueOdometer: z.coerce.number().optional(),
  isUrgent: z.boolean().default(false),
  // Completion fields
  isCompleted: z.boolean().default(false),
  completedDate: z.date().optional(),
  completedOdometer: z.coerce.number().optional(),
  serviceLocation: z.string().optional(),
}).refine(data => data.dueDate || data.dueOdometer, {
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
  
  const { watch } = form;
  const isCompleted = watch('isCompleted');

  useEffect(() => {
    if (open) {
      form.reset({
        serviceType: reminder?.serviceType || '',
        notes: reminder?.notes || '',
        dueDate: reminder?.dueDate ? new Date(reminder.dueDate) : undefined,
        dueOdometer: reminder?.dueOdometer || undefined,
        isUrgent: reminder?.isUrgent || false,
        isCompleted: reminder?.isCompleted || false,
        completedDate: reminder?.completedDate ? new Date(reminder.completedDate) : new Date(),
        completedOdometer: reminder?.completedOdometer || reminder?.dueOdometer || lastOdometer || undefined,
        serviceLocation: reminder?.serviceLocation || '',
      });
    }
  }, [open, reminder, form, lastOdometer]);


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
    
    const reminderData = {
      id: reminderId,
      vehicleId,
      serviceType: values.serviceType,
      notes: values.notes || '',
      dueDate: values.dueDate?.toISOString() || null,
      dueOdometer: values.dueOdometer || null,
      isUrgent: values.isUrgent,
      isCompleted: values.isCompleted,
      completedDate: values.isCompleted ? values.completedDate?.toISOString() : null,
      completedOdometer: values.isCompleted ? values.completedOdometer : null,
      serviceLocation: values.isCompleted ? values.serviceLocation : null,
    };

    setDocumentNonBlocking(reminderRef, reminderData, { merge: true });

    toast({
      title: isEditing ? 'Recordatorio Actualizado' : 'Recordatorio Creado',
      description: `El servicio "${values.serviceType}" ha sido ${isEditing ? 'actualizado' : 'añadido'}.`,
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

            <div className="grid grid-cols-2 gap-4">
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
                                initialFocus
                            />
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
              name="isUrgent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>¿Es Urgente?</FormLabel>
                    <FormDescription>Se resaltará en la lista.</FormDescription>
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
              name="isCompleted"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Marcar como Completado</FormLabel>
                     <FormDescription>Registra la finalización del servicio.</FormDescription>
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

            {isCompleted && (
              <div className="space-y-4 p-4 border rounded-md bg-muted/20">
                <div className="grid grid-cols-2 gap-4">
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


            <DialogFooter>
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

    