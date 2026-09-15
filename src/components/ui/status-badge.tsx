"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  Settings,
  CheckCircle2,
  Archive,
  PauseCircle,
  Disc,
  CircleDashed,
  Workflow,
  Users,
  Sparkles,
  GitBranch,
} from 'lucide-react';

export type EntityStatusType =
  | 'ACTIVE'
  | 'active'
  | 'BUILDING'
  | 'building'
  | 'DRAFT'
  | 'draft'
  | 'PUBLISHED'
  | 'published'
  | 'ARCHIVED'
  | 'archived'
  | 'PAUSED'
  | 'paused'
  | 'COMPLETE'
  | 'COMPLETED'
  | 'completed'
  | 'IN_PROGRESS'
  | 'IN PROGRESS'
  | 'in_progress'
  | 'TO_DO'
  | 'TODO'
  | 'TO DO'
  | 'OPEN'
  | 'open'
  | string;

export function EntityStatusBadge({
  status,
  className,
}: {
  status?: EntityStatusType;
  className?: string;
}) {
  if (!status) return null;

  const normalized = String(status).toUpperCase().trim();

  // Task-specific filled solid badges (Image 2)
  if (normalized === 'COMPLETE' || normalized === 'COMPLETED' || normalized === 'DONE') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-xs',
          className
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-white shrink-0" />
        <span>COMPLETE</span>
      </span>
    );
  }

  if (normalized === 'IN_PROGRESS' || normalized === 'IN PROGRESS' || normalized === 'DOING') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-xs',
          className
        )}
      >
        <Disc className="h-3.5 w-3.5 text-white shrink-0" />
        <span>IN PROGRESS</span>
      </span>
    );
  }

  if (normalized === 'TO_DO' || normalized === 'TODO' || normalized === 'TO DO' || normalized === 'OPEN') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300',
          className
        )}
      >
        <CircleDashed className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        <span>TO DO</span>
      </span>
    );
  }

  // General Entity soft badges (Image 1 & 3)
  if (normalized === 'ACTIVE') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
        <span>ACTIVE</span>
      </span>
    );
  }

  if (normalized === 'BUILDING') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400',
          className
        )}
      >
        <Settings className="h-3 w-3 text-amber-500 shrink-0" />
        <span>BUILDING</span>
      </span>
    );
  }

  if (normalized === 'DRAFT') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400',
          className
        )}
      >
        <FileText className="h-3 w-3 text-blue-500 shrink-0" />
        <span>DRAFT</span>
      </span>
    );
  }

  if (normalized === 'PUBLISHED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400',
          className
        )}
      >
        <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
        <span>PUBLISHED</span>
      </span>
    );
  }

  if (normalized === 'ARCHIVED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-purple-50 dark:bg-purple-950/40 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-400',
          className
        )}
      >
        <Archive className="h-3 w-3 text-purple-600 shrink-0" />
        <span>ARCHIVED</span>
      </span>
    );
  }

  if (normalized === 'PAUSED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400',
          className
        )}
      >
        <PauseCircle className="h-3 w-3 text-amber-600 shrink-0" />
        <span>PAUSED</span>
      </span>
    );
  }

  // Fallback default
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300',
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />
      <span>{normalized}</span>
    </span>
  );
}

export function EntityModeBadge({
  mode,
  className,
}: {
  mode?: string;
  className?: string;
}) {
  if (!mode) return null;

  const normalized = String(mode).toUpperCase().trim();

  if (normalized === 'SWARM') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400',
          className
        )}
      >
        <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <span>Swarm</span>
      </span>
    );
  }

  if (normalized === 'AI' || normalized === 'AI MODE' || normalized === 'AI_MODE') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-purple-50 dark:bg-purple-950/40 px-3 py-1 text-xs font-medium text-purple-700 dark:text-purple-400',
          className
        )}
      >
        <Sparkles className="h-3.5 w-3.5 text-purple-600 shrink-0" />
        <span>AI Mode</span>
      </span>
    );
  }

  // Default to Workflow / Flow Mode
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-400',
        className
      )}
    >
      <Workflow className="h-3.5 w-3.5 text-blue-600 shrink-0" />
      <span>{normalized === 'FLOW MODE' || normalized === 'FLOW_MODE' ? 'Flow Mode' : 'Workflow'}</span>
    </span>
  );
}

export function OnlineOfflineBadge({
  isOnline,
  className,
  showLabel = true,
  size = "md",
}: {
  isOnline?: boolean | null;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
}) {
  const online = Boolean(isOnline);
  if (online) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-bold rounded-full transition-colors border shadow-2xs",
          size === "sm"
            ? "px-2 py-0.5 text-[11px]"
            : "px-2.5 py-1 text-xs",
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
          className
        )}
        title="Tài khoản đang đăng nhập trong trình duyệt (Online)"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        {showLabel && <span>Online</span>}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full transition-colors border shadow-2xs",
        size === "sm"
          ? "px-2 py-0.5 text-[11px]"
          : "px-2.5 py-1 text-xs",
        "bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 border-slate-200 dark:border-slate-700/80",
        className
      )}
      title="Tài khoản đã đăng xuất khỏi trình duyệt (Offline)"
    >
      <span className="inline-flex rounded-full h-2 w-2 bg-slate-400 shrink-0" />
      {showLabel && <span>Offline</span>}
    </span>
  );
}

export default EntityStatusBadge;
