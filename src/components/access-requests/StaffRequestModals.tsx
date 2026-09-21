"use client";

import { useState } from "react";
import { Loader2, Monitor, KeyRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  machineModalOpen: boolean;
  onMachineModalOpenChange: (open: boolean) => void;
  extensionModalOpen: boolean;
  onExtensionModalOpenChange: (open: boolean) => void;
  /** Bound machine info for the change-machine modal (optional display). */
  boundMachineName?: string | null;
  boundMachineId?: string | null;
  boundOsUser?: string | null;
  onMachineSuccess?: () => void;
  onExtensionSuccess?: () => void;
};

/**
 * Shared modals: yêu cầu đổi máy + yêu cầu kích hoạt Extension.
 * Open from Settings / Extensions / Header avatar menu.
 */
export function StaffRequestModals({
  machineModalOpen,
  onMachineModalOpenChange,
  extensionModalOpen,
  onExtensionModalOpenChange,
  boundMachineName,
  boundMachineId,
  boundOsUser,
  onMachineSuccess,
  onExtensionSuccess,
}: Props) {
  const [machineReason, setMachineReason] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const utils = trpc.useUtils();

  const requestMachineChangeMutation = trpc.user.requestMachineChange.useMutation({
    onSuccess: () => {
      setMachineReason("");
      onMachineModalOpenChange(false);
      utils.user.myMachineChangeRequest.invalidate();
      utils.user.listRequestsForUser.invalidate();
      utils.user.listMyRequests.invalidate();
      utils.admin.listPendingMachineChangeRequests.invalidate();
      utils.admin.listAllAccessRequests.invalidate();
      onMachineSuccess?.();
    },
  });

  const requestExtensionAccessMutation = trpc.user.requestExtensionAccess.useMutation({
    onSuccess: () => {
      setExtensionReason("");
      onExtensionModalOpenChange(false);
      utils.user.myExtensionAccessRequest.invalidate();
      utils.user.listRequestsForUser.invalidate();
      utils.user.listMyRequests.invalidate();
      utils.admin.listPendingExtensionAccessRequests.invalidate();
      utils.admin.listAllAccessRequests.invalidate();
      onExtensionSuccess?.();
    },
  });

  return (
    <>
      <Dialog open={machineModalOpen} onOpenChange={onMachineModalOpenChange}>
        <DialogContent className="sm:max-w-md rounded-3xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Monitor className="w-5 h-5 text-cyan-500" />
              Yêu cầu đổi máy
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Extension và Client Agent chỉ hoạt động trên thiết bị đã liên kết. Admin sẽ hủy liên kết máy cũ sau khi duyệt.
            </p>

            {(boundMachineId || boundMachineName) && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3 text-sm">
                <div className="font-semibold text-slate-900 dark:text-white">
                  {boundMachineName || "Máy đã gắn"}
                </div>
                {boundMachineId && (
                  <div className="font-mono text-xs text-slate-500 dark:text-slate-400 break-all mt-0.5">
                    {boundMachineId}
                    {boundOsUser ? ` · ${boundOsUser}` : ""}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Lý do yêu cầu đổi máy
              </label>
              <textarea
                value={machineReason}
                onChange={(e) => setMachineReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ví dụ: Đổi laptop công ty / máy cũ hỏng..."
                className="w-full rounded-2xl border border-cyan-200 dark:border-cyan-800/60 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>

            {requestMachineChangeMutation.error && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {requestMachineChangeMutation.error.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onMachineModalOpenChange(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={
                machineReason.trim().length < 5 ||
                requestMachineChangeMutation.isPending
              }
              onClick={() =>
                requestMachineChangeMutation.mutate({
                  reason: machineReason.trim(),
                })
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 cursor-pointer"
            >
              {requestMachineChangeMutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              Gửi yêu cầu đổi máy
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={extensionModalOpen} onOpenChange={onExtensionModalOpenChange}>
        <DialogContent className="sm:max-w-md rounded-3xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-rose-500" />
              Yêu cầu kích hoạt Extension
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Quyền truy cập Extension/Client Agent của bạn đang bị vô hiệu hóa. Gửi yêu cầu để Admin mở khóa và cấp lại Personal Token.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Lý do cần kích hoạt lại
              </label>
              <textarea
                value={extensionReason}
                onChange={(e) => setExtensionReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ví dụ: Cần dùng lại Extension sau khi Admin thu hồi / đổi máy mới..."
                className="w-full rounded-2xl border border-rose-200 dark:border-rose-800/60 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              />
            </div>

            {requestExtensionAccessMutation.error && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {requestExtensionAccessMutation.error.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onExtensionModalOpenChange(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={
                extensionReason.trim().length < 5 ||
                requestExtensionAccessMutation.isPending
              }
              onClick={() =>
                requestExtensionAccessMutation.mutate({
                  reason: extensionReason.trim(),
                })
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 cursor-pointer"
            >
              {requestExtensionAccessMutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              Gửi yêu cầu kích hoạt
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
