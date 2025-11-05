import type { Metadata } from 'next';
import Image from 'next/image';
import { vehicles } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Car, Fuel, Gauge } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Mis Vehículos - FuelWise',
};

export default function VehiclesPage() {

  return (
    <div>
        <div className='flex items-center justify-between mb-6'>
            <h1 className='text-3xl font-headline'>Mis Vehículos</h1>
            <Button>
                <Plus className='-ml-1 mr-2 h-4 w-4' />
                Añadir Vehículo
            </Button>
        </div>
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
                    <CardFooter>
                        <Button variant="outline" className="w-full">
                            <Car className='mr-2' />
                            Gestionar Vehículo
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    </div>
  );
}
