import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ProcessedServiceReminder } from '@/lib/types';
import { Wrench, Calendar, Gauge } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';

interface ServiceRemindersProps {
  data: ProcessedServiceReminder[];
}

export default function ServiceReminders({ data }: ServiceRemindersProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Recordatorios de Servicio</CardTitle>
        <CardDescription>Próximos mantenimientos programados.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[218px]">
          <div className="space-y-4">
            {data.length > 0 ? (
              data.map((reminder) => (
                <div key={reminder.id} className="flex items-start gap-4">
                  <div className="flex-shrink-0 pt-1">
                    <Wrench className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <p className="font-semibold">{reminder.serviceType}</p>
                       <div className="flex items-center gap-2">
                        {reminder.isOverdue && <Badge variant="destructive">Vencido</Badge>}
                        {reminder.isUrgent && <Badge className="bg-amber-500 hover:bg-amber-500/80 text-white">Urgente</Badge>}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                      {reminder.dueDate && (
                        <span className='flex items-center gap-1.5'>
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(reminder.dueDate)}
                        </span>
                      )}
                      {reminder.dueOdometer && (
                         <span className='flex items-center gap-1.5'>
                            <Gauge className="h-3.5 w-3.5" />
                            {reminder.dueOdometer.toLocaleString()} km
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{reminder.notes}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No hay recordatorios de servicio.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
