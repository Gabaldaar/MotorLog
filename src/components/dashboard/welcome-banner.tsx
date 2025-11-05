import Image from 'next/image';
import type { Vehicle, FuelLog } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import AddFuelLogDialog from './add-fuel-log-dialog';

interface WelcomeBannerProps {
  vehicle: Vehicle;
  lastLog?: FuelLog;
}

export default function WelcomeBanner({ vehicle, lastLog }: WelcomeBannerProps) {
  return (
    <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-6">
                <CardHeader className="p-0">
                    <CardTitle className="font-headline text-3xl">
                        Bienvenido a FuelWise
                    </CardTitle>
                    <CardDescription className="text-base">
                        Gestionando tu {vehicle.make} {vehicle.model} ({vehicle.year})
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0 pt-6">
                    <p className="text-muted-foreground mb-4">
                        Aquí tienes un resumen del rendimiento y los próximos mantenimientos de tu vehículo. Añade un nuevo repostaje para mantener tus datos al día.
                    </p>
                   {vehicle && <AddFuelLogDialog vehicleId={vehicle.id} lastLog={lastLog} vehicle={vehicle} />}
                </CardContent>
            </div>
             {vehicle.imageUrl && (
                <div className="relative md:w-1/3 min-h-[200px] md:min-h-0">
                    <Image
                        src={vehicle.imageUrl}
                        alt={`${vehicle.make} ${vehicle.model}`}
                        fill
                        className="object-cover"
                        data-ai-hint={vehicle.imageHint}
                    />
                </div>
            )}
        </div>
    </Card>
  );
}
