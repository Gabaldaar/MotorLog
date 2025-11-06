'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, X as XIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
    dateRange: DateRange | undefined;
    setDateRange: (date: DateRange | undefined) => void;
}

export function DateRangePicker({ className, dateRange, setDateRange }: DateRangePickerProps) {
  
  return (
    <div className={cn('grid gap-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
           <div className="relative w-[300px]">
             <Button
                id="date"
                variant={'outline'}
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !dateRange && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, 'LLL dd, y', {locale: es})} -{' '}
                      {format(dateRange.to, 'LLL dd, y', {locale: es})}
                    </>
                  ) : (
                    format(dateRange.from, 'LLL dd, y', {locale: es})
                  )
                ) : (
                  <span>Seleccione un rango</span>
                )}
              </Button>
              {dateRange && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={(e) => {
                        e.stopPropagation();
                        setDateRange(undefined);
                    }}
                >
                    <XIcon className="h-4 w-4" />
                </Button>
              )}
           </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={setDateRange}
            numberOfMonths={2}
            locale={es}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
