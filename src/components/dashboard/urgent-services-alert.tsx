'use client';

import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Wrench } from 'lucide-react';
import type { ProcessedServiceReminder } from '@/lib/types';
import { Badge } from '../ui/badge';

interface UrgentServicesAlertProps {
  reminders: ProcessedServiceReminder[];
}

export default function UrgentServicesAlert({ reminders }: UrgentServicesAlertProps) {
  if (reminders.length === 0) {
    return null;
  }

  const overdueCount = reminders.filter(r => r.isOverdue).length;
  const urgentCount = reminders.length - overdueCount;

  return (
    <Alert variant={overdueCount > 0 ? "destructive" : "default"} className="border-amber-500 bg-amber-500/10 text-amber-900 [&>svg]:text-amber-600 dark:border-amber-500/50 dark:bg-amber-900/20 dark:text-amber-200 dark:[&>svg]:text-amber-500">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="font-headline text-lg">
        ¡Atención de Mantenimiento Requerida!
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div className="flex-1">
                Tienes {reminders.length} servicio(s) que requieren atención inmediata.
                <div className="mt-2 text-xs">
                    {overdueCount > 0 && <Badge variant="destructive" className="mr-2">{overdueCount} Vencido(s)</Badge>}
                    {urgentCount > 0 && <Badge className="bg-amber-500 hover:bg-amber-500/80 text-white">{urgentCount} Urgente(s)</Badge>}
                </div>
            </div>
            <Button asChild className="mt-3 sm:mt-0">
                <Link href="/dashboard/services">
                    <Wrench className="mr-2 h-4 w-4" />
                    Ver Servicios
                </Link>
            </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
