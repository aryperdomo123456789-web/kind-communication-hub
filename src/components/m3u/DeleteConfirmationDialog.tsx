import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeleteConfirmationDialogProps {
  open: boolean;
  loading?: boolean;
  title: string;
  description: string;
  confirmationValue: string;
  confirmationHint: string;
  destructiveLabel: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}

export function DeleteConfirmationDialog({
  open,
  loading = false,
  title,
  description,
  confirmationValue,
  confirmationHint,
  destructiveLabel,
  onOpenChange,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    if (!open) {
      setTypedValue("");
    }
  }, [open]);

  const canConfirm = typedValue.trim() === confirmationValue.trim() && !loading;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border border-red-500/20 bg-[#111111] text-white sm:max-w-xl">
        <AlertDialogHeader className="space-y-4 text-left">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400">
              <AlertTriangle size={20} />
            </div>
            <div className="space-y-2">
              <AlertDialogTitle className="text-xl text-white">{title}</AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-6 text-neutral-300">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
              Confirmação manual
            </div>
            <div className="mt-2 text-sm text-neutral-200">
              Digite <span className="font-semibold text-white">{confirmationValue}</span> para
              liberar a exclusão.
            </div>
            <Input
              autoComplete="off"
              value={typedValue}
              onChange={(event) => setTypedValue(event.target.value)}
              placeholder={confirmationHint}
              className="mt-3 border-white/10 bg-[#0d0d0d] text-white placeholder:text-neutral-500"
            />
          </div>
        </div>

        <AlertDialogFooter className="gap-3 sm:gap-2">
          <AlertDialogCancel
            disabled={loading}
            className="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            Cancelar
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="inline-flex items-center gap-2"
          >
            <Trash2 size={14} />
            {loading ? "Excluindo..." : destructiveLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
