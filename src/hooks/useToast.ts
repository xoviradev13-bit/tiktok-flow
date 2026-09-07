"use client";

import { toast as sonnerToast } from "sonner";

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function toast(opts: ToastOptions | string) {
  if (typeof opts === "string") {
    return sonnerToast(opts);
  }

  const { title, description, variant } = opts;
  if (variant === "destructive") {
    return sonnerToast.error(title || "Error", {
      description,
    });
  }

  return sonnerToast.success(title || "Success", {
    description,
  });
}

export function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
  };
}

export default useToast;
