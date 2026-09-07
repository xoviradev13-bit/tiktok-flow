"use client";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChipProps {
  label: string;
  onRemove?: () => void;
  variant?: "default" | "query";
  className?: string;
}

export function Chip({ label, onRemove, variant = "default", className }: ChipProps) {
  return (
    <button
      className={cn(
        "group flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
        "hover:bg-muted hover:border-muted-foreground/20",
        className
      )}
      onClick={onRemove}
      type="button"
    >
      <span className="truncate max-w-[200px]">{label}</span>
      {onRemove && (
        <X 
          size={14} 
          className="flex-shrink-0 opacity-60 transition-opacity group-hover:opacity-100" 
        />
      )}
    </button>
  );
}

interface ChipGroupProps {
  chips: Array<{ id: string; label: string; onRemove: () => void }>;
  onClearAll?: () => void;
  className?: string;
}

export function ChipGroup({ chips, onClearAll, className }: ChipGroupProps) {
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {chips.map((chip) => (
        <Chip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
      ))}
      {chips.length > 0 && onClearAll && (
        <button
          className="rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted cursor-pointer"
          onClick={onClearAll}
          type="button"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
