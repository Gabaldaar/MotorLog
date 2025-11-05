'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useUser, useFirestore } from '@/firebase';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, doc } from 'firebase/firestore';
import type { ConfigItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.'),
});

interface SettingsListProps {
  title: string;
  description: string;
  items: ConfigItem[];
  collectionName: 'fuel_types' | 'service_types' | 'gas_stations';
  itemName: string;
  isLoading: boolean;
}

export default function SettingsList({ title, description, items, collectionName, itemName, isLoading }: SettingsListProps) {
  const [editingItem, setEditingItem] = useState<ConfigItem | null>(null);
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '' },
  });

  const { isSubmitting, isValid } = form.formState;

  const startEditing = (item: ConfigItem) => {
    setEditingItem(item);
    form.setValue('name', item.name);
  };

  const cancelEditing = () => {
    setEditingItem(null);
    form.reset();
  };

  const handleDelete = (itemId: string) => {
    if (!user) return;
    const itemRef = doc(firestore, collectionName, itemId);
    deleteDocumentNonBlocking(itemRef);
    toast({
        title: `${itemName} eliminado`,
        description: 'El elemento ha sido eliminado correctamente.'
    })
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!user) return;

    if (editingItem) {
      // Update
      const itemRef = doc(firestore, collectionName, editingItem.id);
      setDocumentNonBlocking(itemRef, { name: values.name }, { merge: true });
      toast({
        title: `${itemName} actualizado`,
        description: 'El elemento ha sido actualizado correctamente.'
      })
    } else {
      // Create
      const collectionRef = collection(firestore, collectionName);
      addDocumentNonBlocking(collectionRef, { name: values.name });
       toast({
        title: `${itemName} añadido`,
        description: 'El nuevo elemento ha sido guardado.'
      })
    }
    cancelEditing();
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
            {isLoading && <div className="text-muted-foreground text-center p-4">Cargando...</div>}
            {!isLoading && items.length === 0 && !editingItem && (
                 <p className="text-muted-foreground text-sm text-center p-4">
                    No hay elementos. Añade uno para empezar.
                </p>
            )}
            {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
                {editingItem?.id === item.id ? (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center gap-2 flex-1">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                    <FormControl>
                                        <Input {...field} autoFocus />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" size="sm" disabled={isSubmitting || !isValid}>
                                {isSubmitting ? <Loader2 className="animate-spin" /> : 'Guardar'}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={cancelEditing}>Cancelar</Button>
                        </form>
                    </Form>
                ) : (
                    <>
                    <span>{item.name}</span>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => startEditing(item)}>
                            <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                    </>
                )}
                </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="border-t pt-6">
        {!editingItem && (
             <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center gap-2 w-full">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem className="flex-1">
                            <FormControl>
                                <Input {...field} placeholder={`Añadir nuevo ${itemName.toLowerCase()}`} />
                            </FormControl>
                             <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" disabled={isSubmitting || !isValid}>
                        <Plus className="-ml-1 mr-2 h-4 w-4" /> Añadir
                    </Button>
                </form>
            </Form>
        )}
      </CardFooter>
    </Card>
  );
}
