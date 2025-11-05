'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import SettingsList from '@/components/settings/settings-list';
import type { ConfigItem } from '@/lib/types';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Droplets, Wrench, Building } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  // Queries now point to top-level collections
  const fuelTypesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'fuel_types'), orderBy('name'));
  }, [firestore, user]);

  const serviceTypesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'service_types'), orderBy('name'));
  }, [firestore, user]);

  const gasStationsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'gas_stations'), orderBy('name'));
  }, [firestore, user]);

  const { data: fuelTypes, isLoading: isLoadingFuel } = useCollection<ConfigItem>(fuelTypesQuery);
  const { data: serviceTypes, isLoading: isLoadingServices } = useCollection<ConfigItem>(serviceTypesQuery);
  const { data: gasStations, isLoading: isLoadingStations } = useCollection<ConfigItem>(gasStationsQuery);


  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Configuración</CardTitle>
        <CardDescription>
          Personaliza las opciones de la aplicación para agilizar el ingreso de datos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="fuel">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="fuel"><Droplets className="mr-2" />Combustibles</TabsTrigger>
            <TabsTrigger value="services"><Wrench className="mr-2" />Servicios</TabsTrigger>
            <TabsTrigger value="stations"><Building className="mr-2" />Gasolineras</TabsTrigger>
          </TabsList>
          <TabsContent value="fuel">
            <SettingsList
              title="Tipos de Combustible"
              description="Gestiona los tipos de combustible que usas."
              items={fuelTypes || []}
              collectionName="fuel_types"
              itemName="Tipo de Combustible"
              isLoading={isLoadingFuel}
            />
          </TabsContent>
          <TabsContent value="services">
             <SettingsList
              title="Tipos de Servicio"
              description="Gestiona los tipos de servicios de mantenimiento."
              items={serviceTypes || []}
              collectionName="service_types"
              itemName="Tipo de Servicio"
              isLoading={isLoadingServices}
            />
          </TabsContent>
          <TabsContent value="stations">
             <SettingsList
              title="Gasolineras"
              description="Gestiona tus gasolineras frecuentes."
              items={gasStations || []}
              collectionName="gas_stations"
              itemName="Gasolinera"
              isLoading={isLoadingStations}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
