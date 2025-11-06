
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Plus, Loader2, Car } from 'lucide-react';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

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
import type { Vehicle, ConfigItem } from '@/lib/types';
import { useUser, useFirestore, useCollection, useMemoFirebase, useStorage } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const formSchema = z.object({
  make: z.string().min(1, 'La marca es obligatoria.'),
  model: z.string().min(1, 'El modelo es obligatorio.'),
  year: z.coerce.number().min(1900, 'Año inválido.').max(new Date().getFullYear() + 1, 'Año inválido.'),
  plate: z.string().min(1, 'La patente es obligatoria.'),
  fuelCapacityLiters: z.coerce.number().min(1, 'La capacidad del tanque es obligatoria.'),
  averageConsumptionKmPerLiter: z.coerce.number().min(1, 'El consumo es obligatorio.'),
  imageFile: z.any()
    .refine((file) => !file || file.size <= MAX_FILE_SIZE, `El tamaño máximo es 5MB.`)
    .refine((file) => !file || ACCEPTED_IMAGE_TYPES.includes(file.type), "Solo se aceptan formatos .jpg, .jpeg, .png y .webp."),
  defaultFuelType: z.string({
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
  const storage = useStorage();
  const isEditing = !!vehicle;

  const fuelTypesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'fuel_types'), orderBy('name'));
  }, [firestore, user]);

  const { data: fuelTypes, isLoading: isLoadingFuelTypes } = useCollection<ConfigItem>(fuelTypesQuery);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      make: vehicle?.make || '',
      model: vehicle?.model || '',
      year: vehicle?.year,
      plate: vehicle?.plate || '',
      fuelCapacityLiters: vehicle?.fuelCapacityLiters,
      averageConsumptionKmPerLiter: vehicle?.averageConsumptionKmPerLiter,
      imageFile: undefined,
      defaultFuelType: vehicle?.defaultFuelType,
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
    let imageUrl = vehicle?.imageUrl || '';

    // Handle file upload
    if (values.imageFile) {
        try {
            const file = values.imageFile as File;
            const imageStorageRef = storageRef(storage, `vehicle-images/${user.uid}/${vehicleId}/${file.name}`);
            const snapshot = await uploadBytes(imageStorageRef, file);
            imageUrl = await getDownloadURL(snapshot.ref);
        } catch (error) {
            console.error("Error uploading image: ", error);
            toast({
                variant: "destructive",
                title: "Error al subir la imagen",
                description: "No se pudo subir la imagen del vehículo. Inténtalo de nuevo.",
            });
            setIsSubmitting(false);
            return;
        }
    }


    const vehicleRef = doc(firestore, 'vehicles', vehicleId);
    
    const vehicleData = {
        ...values,
        id: vehicleId,
        imageUrl: imageUrl,
        imageHint: `${values.make.toLowerCase()} ${values.model.toLowerCase()}`,
    };
    delete (vehicleData as any).imageFile; // Don't save the file object to Firestore

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
          imageFile: undefined,
          defaultFuelType: undefined,
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
              name="imageFile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Imagen del Vehículo</FormLabel>
                  <FormControl>
                    <Input 
                      type="file"
                      accept="image/*"
                      onChange={(e) => field.onChange(e.target.files ? e.target.files[0] : null)}
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
