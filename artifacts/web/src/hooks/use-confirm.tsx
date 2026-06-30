import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Imperative confirmation dialog hook.
 *
 * Usage:
 *   const { confirm, dialog } = useConfirm();
 *   // render {dialog} in JSX
 *   // call: if (!(await confirm({ title: "Delete?", destructive: true }))) return;
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  function handleAction(value: boolean) {
    pending?.resolve(value);
    setPending(null);
  }

  const dialog = (
    <AlertDialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) handleAction(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title ?? ""}</AlertDialogTitle>
          {pending?.description && (
            <AlertDialogDescription>{pending.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handleAction(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleAction(true)}
            className={
              pending?.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {pending?.confirmLabel ?? (pending?.destructive ? "Delete" : "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
