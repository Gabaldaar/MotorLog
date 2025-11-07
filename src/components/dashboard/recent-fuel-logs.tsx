import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { ProcessedFuelLog } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';

interface RecentFuelLogsProps {
  data: ProcessedFuelLog[];
}

export default function RecentFuelLogs({ data }: RecentFuelLogsProps) {
  const recentLogs = [...data].reverse().slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Recargas Recientes</CardTitle>
        <CardDescription>Últimos 5 registros de combustible.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Litros</TableHead>
                <TableHead className="text-right">Costo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLogs.length > 0 ? (
                recentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDate(log.date)}</TableCell>
                    <TableCell className="text-right">{log.liters.toFixed(2)}L</TableCell>
                    <TableCell className="text-right">{formatCurrency(log.totalCost)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center h-24">
                    No hay registros de combustible.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
