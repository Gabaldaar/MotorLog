
'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase/provider';
import { doc } from 'firebase/firestore';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';

interface DeleteServiceReminderDialogProps {
  vehicleId: string;
  reminderId: string;
  children: React.ReactNode;
}

export default function DeleteServiceReminderDialog({
  vehicleId,
  reminderId,
  children
}: DeleteServiceReminderDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const handleDelete = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error de autenticación',
        description: 'Debes iniciar sesión para eliminar un recordatorio.',
      });
      return;
    }
    setIsSubmitting(true);

    const reminderRef = doc(firestore, 'vehicles', vehicleId, 'service_reminders', reminderId);
    deleteDocumentNonBlocking(reminderRef);

    toast({
      title: 'Recordatorio Eliminado',
      description: 'El recordatorio de servicio ha sido eliminado.',
    });
    setIsSubmitting(false);
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará permanentemente este recordatorio de servicio.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isSubmitting}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
