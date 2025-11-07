'use client';

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatDate, formatCurrency } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface EvolutionChartProps<T> {
  title: string;
  data: T[];
  dataKey: keyof T;
  valueKey: keyof T;
  valueFormatter: (value: number) => string;
  tooltipLabel: string;
  icon: LucideIcon;
}

export function EvolutionChart<T>({ title, data, dataKey, valueKey, valueFormatter, tooltipLabel, icon: Icon }: EvolutionChartProps<T>) {

  const chartData = data.map(item => ({
    ...item,
    formattedDate: formatDate(item[dataKey] as string),
  }));

  const isCurrency = valueKey === 'pricePerLiter';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="formattedDate" 
                tick={{ fontSize: 12 }} 
                tickLine={false} 
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fontSize: 12 }} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(value) => isCurrency ? formatCurrency(value) : valueFormatter(value)}
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                }}
                formatter={(value: number) => [isCurrency ? formatCurrency(value) : valueFormatter(value), tooltipLabel]}
                labelFormatter={(label) => `Fecha: ${label}`}
              />
              <Line 
                type="monotone" 
                dataKey={valueKey as string} 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{
                    r: 4,
                    fill: 'hsl(var(--primary))',
                    stroke: 'hsl(var(--background))',
                    strokeWidth: 2,
                }}
                activeDot={{ 
                    r: 6,
                    fill: 'hsl(var(--primary))',
                    stroke: 'hsl(var(--background))',
                    strokeWidth: 2,
                }}
             />
            </LineChart>
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
