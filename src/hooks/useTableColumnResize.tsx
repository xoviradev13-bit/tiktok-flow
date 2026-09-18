"use client";

import React, { useState, useCallback, useRef } from "react";

export interface ColumnResizeDef {
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
}

export type ColumnResizeConfig<K extends string = string> = Record<K, ColumnResizeDef>;

interface UseTableColumnResizeOptions<K extends string> {
  tableId: string;
  columns: ColumnResizeConfig<K>;
  /**
   * Attach this ref to the table's scroll container (or table element itself).
   * When provided, the hook updates column widths via CSS custom properties
   * directly on the DOM node during drag — zero React re-renders until mouseup,
   * giving the silkiest possible resize feel.
   */
  tableRef?: React.RefObject<HTMLElement | null>;
}

/** Returns the CSS variable name for a given column key */
const cssVar = (key: string) => `--resize-col-${key}`;

export function useTableColumnResize<K extends string>({
  tableId,
  columns,
  tableRef,
}: UseTableColumnResizeOptions<K>) {
  const storageKey = `table_col_widths_${tableId}`;

  // ─── Initial widths (localStorage → defaults) ──────────────────────────────
  const [columnWidths, setColumnWidths] = useState<Record<K, number>>(() => {
    const initial: Record<string, number> = {};
    for (const key of Object.keys(columns) as K[]) {
      initial[key] = columns[key].defaultWidth;
    }
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          for (const key of Object.keys(columns) as K[]) {
            if (typeof parsed[key] === "number" && !isNaN(parsed[key])) {
              const { minWidth, maxWidth } = columns[key];
              initial[key] = Math.min(maxWidth, Math.max(minWidth, parsed[key]));
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    return initial as Record<K, number>;
  });

  // Kept in sync with state — safe to read inside event handlers without stale closure
  const widthsRef = useRef<Record<K, number>>(columnWidths);
  widthsRef.current = columnWidths;

  const [resizingCol, setResizingCol] = useState<K | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // ─── Persistence ───────────────────────────────────────────────────────────
  const saveWidths = useCallback(
    (newWidths: Record<K, number>) => {
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(newWidths));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  // ─── CSS variable helpers ──────────────────────────────────────────────────
  /**
   * Spread the returned object onto the table's scroll-container `style` prop.
   * This seeds all CSS variables so columns render at the correct width on mount.
   *
   * @example
   * <div style={getTableVars()} ref={tableRef} className="overflow-x-auto">
   */
  const getTableVars = useCallback((): React.CSSProperties => {
    const vars: Record<string, string> = {};
    for (const key of Object.keys(columns) as K[]) {
      vars[cssVar(key)] = `${columnWidths[key] ?? columns[key].defaultWidth}px`;
    }
    return vars as React.CSSProperties;
  }, [columns, columnWidths]);

  /**
   * Returns inline styles for a `<th>` or `<td>`.
   * Width is expressed as a CSS variable so it can be updated in the DOM
   * without triggering a React re-render during drag.
   */
  const getColumnStyle = useCallback(
    (key: K): React.CSSProperties => {
      const def = columns[key];
      if (!def) return {};
      return {
        width: `var(${cssVar(key)})`,
        minWidth: `${def.minWidth}px`,
        maxWidth: `${def.maxWidth}px`,
      };
    },
    [columns]
  );

  // ─── Drag logic ────────────────────────────────────────────────────────────
  const handleStartResize = useCallback(
    (key: K, e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const currentWidth = widthsRef.current[key] ?? columns[key]?.defaultWidth ?? 120;

      dragRef.current = { startX: clientX, startWidth: currentWidth };
      setResizingCol(key);

      const def = columns[key];
      if (!def) return;

      const applyWidth = (nextWidth: number) => {
        // Fast path ─ directly mutate CSS custom property on the DOM container.
        // This bypasses React entirely: zero re-renders during drag.
        if (tableRef?.current) {
          tableRef.current.style.setProperty(cssVar(key), `${nextWidth}px`);
        }
        widthsRef.current = { ...widthsRef.current, [key]: nextWidth };
      };

      const onPointerMove = (moveEvent: MouseEvent | TouchEvent) => {
        const drag = dragRef.current;
        if (!drag) return;

        const currentX =
          "touches" in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const nextWidth = Math.min(
          def.maxWidth,
          Math.max(def.minWidth, Math.round(drag.startWidth + (currentX - drag.startX)))
        );

        if (tableRef?.current) {
          // Zero-re-render path: update CSS var directly on the DOM node
          applyWidth(nextWidth);
        } else {
          // Fallback: rAF-throttled React state update (still smoother than raw setState)
          if (rafRef.current !== null) return;
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            applyWidth(nextWidth);
            setColumnWidths((prev) => {
              if (prev[key] === nextWidth) return prev;
              return { ...prev, [key]: nextWidth };
            });
          });
        }
      };

      const onPointerUp = () => {
        // Cancel any pending rAF
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        // Single React state commit — this is the only re-render during a drag session
        const final = { ...widthsRef.current };
        setColumnWidths(final);
        saveWidths(final);

        dragRef.current = null;
        setResizingCol(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);
        window.removeEventListener("touchmove", onPointerMove);
        window.removeEventListener("touchend", onPointerUp);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      window.addEventListener("mousemove", onPointerMove, { passive: false });
      window.addEventListener("mouseup", onPointerUp);
      window.addEventListener("touchmove", onPointerMove, { passive: false });
      window.addEventListener("touchend", onPointerUp);
    },
    [columns, saveWidths, tableRef]
  );

  // ─── Reset helpers ─────────────────────────────────────────────────────────
  const resetColumnWidth = useCallback(
    (key: K) => {
      const def = columns[key];
      if (!def) return;
      const updated = { ...widthsRef.current, [key]: def.defaultWidth };
      widthsRef.current = updated;
      // Sync CSS var immediately so there's no flash
      tableRef?.current?.style.setProperty(cssVar(key), `${def.defaultWidth}px`);
      setColumnWidths(updated);
      saveWidths(updated);
    },
    [columns, saveWidths, tableRef]
  );

  const resetAllWidths = useCallback(() => {
    const reset: Record<string, number> = {};
    for (const key of Object.keys(columns) as K[]) {
      reset[key] = columns[key].defaultWidth;
      tableRef?.current?.style.setProperty(cssVar(key), `${columns[key].defaultWidth}px`);
    }
    const typedReset = reset as Record<K, number>;
    widthsRef.current = typedReset;
    setColumnWidths(typedReset);
    saveWidths(typedReset);
  }, [columns, saveWidths, tableRef]);

  // ─── Resize handle renderer ────────────────────────────────────────────────
  /**
   * @param key    Column key
   * @param side   'right' (default) — sits on the right border of the column
   *               'left'            — sits on the left border (use for sticky-right columns)
   */
  const renderResizeHandle = useCallback(
    (key: K, side: "right" | "left" = "right", extraClasses = "") => {
      const isDragging = resizingCol === key;

      // Translate by ±50% so the 2 px visual bar centres exactly on the 1 px border
      const sideClass =
        side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2";

      // Tooltip appears on the opposite side of the handle so it stays visible
      // Left-side handle (actions col): tooltip floats right → left-[calc(100%+6px)]
      // Right-side handle (most cols):  tooltip floats left  → right-[calc(100%+6px)]
      const tooltipClass =
        side === "left"
          ? "left-[calc(100%+6px)]"
          : "right-[calc(100%+6px)]";

      return (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => handleStartResize(key, e)}
          onTouchStart={(e) => handleStartResize(key, e)}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            resetColumnWidth(key);
          }}
          className={`absolute ${sideClass} top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none z-[100] group/handle flex items-center justify-center ${
            isDragging ? "opacity-100" : "opacity-0 hover:opacity-100"
          } ${extraClasses}`}
        >
          {/* Visual resize bar */}
          <div
            className={`w-[2px] h-full transition-colors ${
              isDragging
                ? "bg-pink-500 shadow-[0_0_6px_rgba(236,72,153,0.8)]"
                : "bg-slate-300 dark:bg-slate-600 group-hover/handle:bg-pink-500"
            }`}
          />

          {/* Styled tooltip — 300 ms delay, vanishes the moment drag starts */}
          {!isDragging && (
            <div
              className={`
                pointer-events-none absolute top-1/2 -translate-y-1/2 ${tooltipClass}
                opacity-0 group-hover/handle:opacity-100
                transition-opacity duration-150 delay-300
                z-[110] whitespace-nowrap
                bg-slate-900/95 dark:bg-slate-800
                text-white text-[10px] leading-tight font-medium
                px-2.5 py-2 rounded-lg
                shadow-2xl border border-white/10
                backdrop-blur-sm
              `}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-pink-400 font-bold">↔</span>
                <span>Kéo để chỉnh rộng cột</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="font-bold">↺</span>
                <span>Nhấp đúp để đặt lại</span>
              </div>
            </div>
          )}
        </div>
      );
    },
    [handleStartResize, resetColumnWidth, resizingCol]
  );

  return {
    columnWidths,
    resizingCol,
    getTableVars,
    getColumnStyle,
    handleStartResize,
    resetColumnWidth,
    resetAllWidths,
    renderResizeHandle,
  };
}
