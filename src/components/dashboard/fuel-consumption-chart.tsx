'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { ProcessedFuelLog } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { useMemo } from 'react';
import { usePreferences } from '@/context/preferences-context';

interface FuelConsumptionChartProps {
  data: ProcessedFuelLog[];
}

export default function FuelConsumptionChart({ data }: FuelConsumptionChartProps) {
  const { consumptionUnit, getConsumptionValue } = usePreferences();
  
  const chartData = useMemo(() => {
    return data
      .filter(log => log.consumption && log.consumption > 0)
      .map(log => ({
        date: formatDate(log.date),
        [consumptionUnit]: getConsumptionValue(log.consumption),
      }));
  }, [data, consumptionUnit, getConsumptionValue]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Rendimiento por Recarga</CardTitle>
        <CardDescription>Rendimiento de combustible ({consumptionUnit}) en cada recarga.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }} 
                tickLine={false} 
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12 }} 
                tickLine={false} 
                axisLine={false}
                label={{ value: consumptionUnit, angle: -90, position: 'insideLeft', offset: 0, style: { textAnchor: 'middle', fontSize: '12px' } }}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                }}
              />
              <Bar dataKey={consumptionUnit} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No hay suficientes datos para mostrar el gráfico.
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  );
}
