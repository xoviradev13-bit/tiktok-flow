import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CircleAlert, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

export type MessageType = "error" | "success" | "info" | "warning";

interface AuthMessageProps {
  message: string;
  type?: MessageType;
  onDismiss?: () => void;
}

const getMessageConfig = (message: string, type?: MessageType) => {
  const detectedType =
    type ||
    (message.toLowerCase().includes("success") ||
    message.toLowerCase().includes("sent") ||
    message.toLowerCase().includes("thành công")
      ? "success"
      : message.toLowerCase().includes("info") ||
        message.toLowerCase().includes("note")
      ? "info"
      : "error");

  const configs = {
    error: {
      icon: CircleAlert,
      bgClass: "bg-rose-50 dark:bg-rose-950/40",
      borderClass: "border-rose-200 dark:border-rose-800/60",
      textClass: "text-rose-800 dark:text-rose-300",
      iconClass: "text-rose-600 dark:text-rose-400",
      progressClass: "bg-rose-500",
    },
    success: {
      icon: CheckCircle2,
      bgClass: "bg-emerald-50 dark:bg-emerald-950/40",
      borderClass: "border-emerald-200 dark:border-emerald-800/60",
      textClass: "text-emerald-800 dark:text-emerald-300",
      iconClass: "text-emerald-600 dark:text-emerald-400",
      progressClass: "bg-emerald-500",
    },
    info: {
      icon: Info,
      bgClass: "bg-sky-50 dark:bg-sky-950/40",
      borderClass: "border-sky-200 dark:border-sky-800/60",
      textClass: "text-sky-800 dark:text-sky-300",
      iconClass: "text-sky-600 dark:text-sky-400",
      progressClass: "bg-sky-500",
    },
    warning: {
      icon: TriangleAlert,
      bgClass: "bg-amber-50 dark:bg-amber-950/40",
      borderClass: "border-amber-200 dark:border-amber-800/60",
      textClass: "text-amber-800 dark:text-amber-300",
      iconClass: "text-amber-600 dark:text-amber-400",
      progressClass: "bg-amber-500",
    },
  };

  return { ...configs[detectedType], type: detectedType };
};

export const AuthMessage = ({ message, type, onDismiss }: AuthMessageProps) => {
  if (!message) return null;

  const config = getMessageConfig(message, type);
  const Icon = config.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={`mb-5 p-3.5 rounded-xl border ${config.bgClass} ${config.borderClass} relative overflow-hidden shadow-xs`}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 ${config.iconClass}`}>
            <Icon className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${config.textClass} leading-relaxed`}>
              {message}
            </p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={`flex-shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${config.textClass} opacity-60 hover:opacity-100 cursor-pointer`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {config.type === "success" && (
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 5, ease: "linear" }}
            className={`absolute bottom-0 left-0 h-0.5 ${config.progressClass} opacity-60`}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
};
