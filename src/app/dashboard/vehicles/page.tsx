'use client';

import Image from 'next/image';
import { useVehicles } from '@/context/vehicle-context';
import type { Vehicle } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Car, Fuel, Gauge, Trash2, Loader2 } from 'lucide-react';
import AddVehicleDialog from '@/components/dashboard/add-vehicle-dialog';
import DeleteVehicleDialog from '@/components/dashboard/delete-vehicle-dialog';

export default function VehiclesPage() {
  const { vehicles, isLoading } = useVehicles();

  return (
    <div>
        <div className='flex items-center justify-between mb-6'>
            <h1 className='text-3xl font-headline'>Mis Vehículos</h1>
            <AddVehicleDialog>
              <Button>
                Añadir Vehículo
              </Button>
            </AddVehicleDialog>
        </div>

        {isLoading ? (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {vehicles.map((vehicle: Vehicle) => (
                    <Card key={vehicle.id} className="flex flex-col">
                        {vehicle.imageUrl && (
                            <div className="relative h-48 w-full">
                            <Image
                                src={vehicle.imageUrl}
                                alt={`${vehicle.make} ${vehicle.model}`}
                                fill
                                className="object-cover rounded-t-lg"
                                data-ai-hint={vehicle.imageHint}
                            />
                            </div>
                        )}
                        <CardHeader>
                            <CardTitle className='font-headline text-2xl'>{vehicle.make} {vehicle.model}</CardTitle>
                            <CardDescription>{vehicle.year} - {vehicle.plate}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <div className="space-y-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Fuel className="h-4 w-4" />
                                    <span>Capacidad: {vehicle.fuelCapacityLiters} L</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Gauge className="h-4 w-4" />
                                    <span>Consumo: {vehicle.averageConsumptionKmPerLiter} km/L</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex gap-2">
                            <AddVehicleDialog vehicle={vehicle}>
                                <Button variant="outline" className="w-full">
                                    <Car className='mr-2' />
                                    Gestionar
                                </Button>
                            </AddVehicleDialog>
                            <DeleteVehicleDialog vehicle={vehicle}>
                                <Button variant="destructive" className="w-full">
                                    <Trash2 className='mr-2' />
                                    Eliminar
                                </Button>
                            </DeleteVehicleDialog>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        )}
         {!isLoading && vehicles.length === 0 && (
            <div className="text-center py-16 border-2 border-dashed rounded-lg">
                <Car className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No hay vehículos</h3>
                <p className="mt-1 text-sm text-muted-foreground">Empieza por añadir tu primer vehículo.</p>
            </div>
        )}
    </div>
  );
}