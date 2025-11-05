
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Plus, Loader2, Car } from 'lucide-react';

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
import { useToast } from '@/hooks/use-toast';
import type { Vehicle } from '@/lib/types';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const formSchema = z.object({
  make: z.string().min(1, 'La marca es obligatoria.'),
  model: z.string().min(1, 'El modelo es obligatorio.'),
  year: z.coerce.number().min(1900, 'Año inválido.').max(new Date().getFullYear() + 1, 'Año inválido.'),
  plate: z.string().min(1, 'La patente es obligatoria.'),
  fuelCapacityLiters: z.coerce.number().min(1, 'La capacidad del tanque es obligatoria.'),
  averageConsumptionKmPerLiter: z.coerce.number().min(1, 'El consumo es obligatorio.'),
  imageUrl: z.string().url('URL de imagen inválida.').optional().or(z.literal('')),
  defaultFuelType: z.enum(['Gasolina', 'Diesel', 'Etanol'], {
    required_error: 'El tipo de combustible es obligatorio.',
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface AddVehicleDialogProps {
    vehicle?: Vehicle;
    children?: React.ReactNode;
}

export default function AddVehicleDialog({ vehicle, children }: AddVehicleDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const isEditing = !!vehicle;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      make: vehicle?.make || '',
      model: vehicle?.model || '',
      year: vehicle?.year,
      plate: vehicle?.plate || '',
      fuelCapacityLiters: vehicle?.fuelCapacityLiters,
      averageConsumptionKmPerLiter: vehicle?.averageConsumptionKmPerLiter,
      imageUrl: vehicle?.imageUrl || '',
      defaultFuelType: vehicle?.defaultFuelType || 'Gasolina',
    },
  });

  async function onSubmit(values: FormValues) {
    if (!user) {
        toast({
            variant: "destructive",
            title: "Error de autenticación",
            description: "Debes iniciar sesión para gestionar vehículos.",
        });
        return;
    }
    setIsSubmitting(true);
    
    const vehicleId = isEditing ? vehicle.id : doc(collection(firestore, '_')).id;
    // Save to the top-level 'vehicles' collection
    const vehicleRef = doc(firestore, 'vehicles', vehicleId);
    
    const vehicleData = {
        ...values,
        id: vehicleId,
        // No longer storing userId, as it's a shared resource
        imageUrl: values.imageUrl || `https://picsum.photos/seed/${vehicleId}/600/400`,
        imageHint: `${values.make.toLowerCase()} ${values.model.toLowerCase()}`,
    };

    setDocumentNonBlocking(vehicleRef, vehicleData, { merge: true });
    
    toast({
        title: isEditing ? 'Vehículo Actualizado' : 'Vehículo Añadido',
        description: `Tu ${values.make} ${values.model} ha sido ${isEditing ? 'actualizado' : 'añadido'}.`,
    });

    setIsSubmitting(false);
    setOpen(false);
    if (!isEditing) {
        form.reset({
          make: '',
          model: '',
          year: undefined,
          plate: '',
          fuelCapacityLiters: undefined,
          averageConsumptionKmPerLiter: undefined,
          imageUrl: '',
          defaultFuelType: 'Gasolina',
        });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ? children : (
            <Button>
                <Plus className="-ml-1 mr-2 h-4 w-4" />
                Añadir Vehículo
            </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">{isEditing ? 'Gestionar' : 'Añadir'} Vehículo</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Edita los detalles de tu vehículo.' : 'Añade un nuevo vehículo a tu garaje.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="make" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Marca</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., Toyota" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="model" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Modelo</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., Corolla" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="year" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Año</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="e.g., 2023" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="plate" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Patente</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., AB-123-CD" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="fuelCapacityLiters" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Capacidad Tanque (L)</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="e.g., 50" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="averageConsumptionKmPerLiter" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Consumo (km/L)</FormLabel>
                        <FormControl>
                            <Input type="number" step="0.1" placeholder="e.g., 14.5" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>
            <FormField
              control={form.control}
              name="defaultFuelType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Combustible por Defecto</FormLabel>
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
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL de la Imagen (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/image.png"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
           
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Guardar Cambios' : 'Añadir Vehículo'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
