
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CalendarIcon, Check, Loader2 } from 'lucide-react';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ServiceReminder } from '@/lib/types';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

const formSchema = z.object({
  completedDate: z.date({ required_error: "La fecha es obligatoria." }),
  completedOdometer: z.coerce.number().min(1, 'El odómetro es obligatorio.'),
  serviceLocation: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CompleteServiceDialogProps {
  vehicleId: string;
  reminder: ServiceReminder;
  lastOdometer: number;
}

export default function CompleteServiceDialog({ vehicleId, reminder, lastOdometer }: CompleteServiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      completedDate: new Date(),
      completedOdometer: reminder.dueOdometer || lastOdometer || undefined,
      serviceLocation: '',
    },
  });

  async function onSubmit(values: FormValues) {
    if (!user) return;
    setIsSubmitting(true);

    const reminderRef = doc(firestore, 'vehicles', vehicleId, 'service_reminders', reminder.id);
    
    const reminderUpdateData = {
      isCompleted: true,
      completedDate: values.completedDate.toISOString(),
      completedOdometer: values.completedOdometer,
      serviceLocation: values.serviceLocation || '',
    };

    setDocumentNonBlocking(reminderRef, reminderUpdateData, { merge: true });

    toast({
      title: '¡Servicio Completado!',
      description: `El servicio "${reminder.serviceType}" ha sido marcado como completado.`,
    });

    setIsSubmitting(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline" className="text-green-600 hover:text-green-700">
            <Check className="h-4 w-4" />
            <span className="sr-only">Completar Servicio</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">Completar Servicio: {reminder.serviceType}</DialogTitle>
          <DialogDescription>
            Registra los detalles de cuándo y dónde se realizó el mantenimiento.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
                 <FormField
                    control={form.control}
                    name="completedOdometer"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Odómetro (km)</FormLabel>
                        <FormControl>
                        <Input type="number" placeholder="e.g., 30150" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="completedDate"
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
                                    disabled={(date) => date > new Date()}
                                    initialFocus
                                />
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
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Marcar como Completado
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
