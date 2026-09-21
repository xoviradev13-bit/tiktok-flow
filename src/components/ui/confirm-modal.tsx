"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  Ban,
  AlertTriangle,
  Trash2,
  RefreshCw,
  MonitorX,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "amber";

export type ConfirmIcon =
  | "trash"
  | "ban"
  | "warning"
  | "refresh"
  | "unlink"
  | "check";

export type ConfirmDialogOptions = {
  title: string;
  description?: string;
  /** Extra body content under the description (details / warning box). */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** Header + confirm-button icon. Defaults from variant if omitted. */
  icon?: ConfirmIcon;
  /** Shown while confirm is pending (parent sets loading). */
  loadingLabel?: string;
};

type InternalState = ConfirmDialogOptions & {
  open: boolean;
  loading: boolean;
};

const ICON_MAP: Record<ConfirmIcon, LucideIcon> = {
  trash: Trash2,
  ban: Ban,
  warning: AlertTriangle,
  refresh: RefreshCw,
  unlink: MonitorX,
  check: CheckCircle2,
};

const VARIANT_DEFAULTS: Record<
  ConfirmVariant,
  { iconWrap: string; confirmBtn: string; icon: ConfirmIcon }
> = {
  danger: {
    iconWrap: "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400",
    confirmBtn: "bg-rose-600 hover:bg-rose-700 text-white",
    icon: "trash",
  },
  warning: {
    iconWrap: "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400",
    confirmBtn: "bg-amber-500 hover:bg-amber-600 text-slate-950",
    icon: "warning",
  },
  amber: {
    iconWrap: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",
    confirmBtn: "bg-amber-500 hover:bg-amber-600 text-slate-950",
    icon: "refresh",
  },
};

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loadingLabel?: string;
  variant?: ConfirmVariant;
  icon?: ConfirmIcon;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  body,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  loadingLabel,
  variant = "danger",
  icon,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  if (!open) return null;

  const styles = VARIANT_DEFAULTS[variant] || VARIANT_DEFAULTS.danger;
  const Icon = ICON_MAP[icon || styles.icon] || Trash2;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${styles.iconWrap}`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3
              id="confirm-modal-title"
              className="text-base font-bold text-slate-900 dark:text-white"
            >
              {title}
            </h3>
            {description ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-line">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {body ? (
          <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line">
            {body}
          </div>
        ) : null}

        <div className="flex justify-end gap-2.5 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer ${styles.confirmBtn}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{loading ? loadingLabel || "Đang xử lý..." : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Drop-in async replacement for window.confirm().
 * Render `{confirmDialog}` once in the page tree.
 */
export function useConfirmDialog() {
  const [state, setState] = useState<InternalState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      // Resolve any previous pending confirm as cancelled
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setState({
        open: true,
        loading: false,
        variant: "danger",
        confirmLabel: "Xác nhận",
        ...options,
      });
    });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => (prev ? { ...prev, loading } : prev));
  }, []);

  const confirmDialog = (
    <ConfirmModal
      open={!!state?.open}
      title={state?.title || ""}
      description={state?.description}
      body={state?.body}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      loadingLabel={state?.loadingLabel}
      variant={state?.variant}
      icon={state?.icon}
      loading={!!state?.loading}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  );

  return { confirm, confirmDialog, setLoading, isOpen: !!state?.open };
}
