import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ProcessedServiceReminder } from '@/lib/types';
import { Wrench, Calendar, Gauge, AlertTriangle } from 'lucide-react';
import { formatDate, cn, formatCurrency } from '@/lib/utils';
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
                    <Wrench className={cn("h-5 w-5 text-muted-foreground", {
                        "text-destructive": reminder.isOverdue,
                        "text-amber-600": reminder.isUrgent,
                    })} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <p className="font-semibold">{reminder.serviceType}</p>
                       <div className="flex items-center gap-2">
                        {reminder.isOverdue && <Badge variant="destructive">Vencido</Badge>}
                        {reminder.isUrgent && <Badge className="bg-amber-500 hover:bg-amber-500/80 text-white">Urgente</Badge>}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center flex-wrap gap-x-4 gap-y-1 mt-1">
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
                       {reminder.isCompleted && reminder.cost && (
                         <span className='flex items-center gap-1.5'>
                            <Gauge className="h-3.5 w-3.5" />
                            {formatCurrency(reminder.cost)}
                        </span>
                      )}
                    </div>
                     {reminder.isCompleted !== true && (
                        <div className={cn('text-sm flex items-center gap-1.5 font-medium mt-1', {
                            'text-destructive': reminder.isOverdue,
                            'text-amber-600': reminder.isUrgent,
                            'text-muted-foreground/80': !reminder.isOverdue && !reminder.isUrgent
                          })}>
                            {(reminder.isOverdue || reminder.isUrgent) && <AlertTriangle className="h-4 w-4" />}
                            
                            {reminder.kmsRemaining !== null && reminder.kmsRemaining < 0 
                              ? `Vencido hace ${Math.abs(reminder.kmsRemaining).toLocaleString()} km`
                              : reminder.kmsRemaining !== null ? `Faltan ${reminder.kmsRemaining.toLocaleString()} km` : ''
                            }
                            {(reminder.kmsRemaining !== null && reminder.daysRemaining !== null && (reminder.kmsRemaining < 0 || reminder.daysRemaining < 0)) ? ' o ' : (reminder.kmsRemaining !== null && reminder.daysRemaining !== null ? ' / ' : '')}
                              {reminder.daysRemaining !== null && reminder.daysRemaining < 0 
                              ? `Vencido hace ${Math.abs(reminder.daysRemaining)} días`
                              : reminder.daysRemaining !== null ? `Faltan ${reminder.daysRemaining} días` : ''
                            }
                        </div>
                     )}
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
