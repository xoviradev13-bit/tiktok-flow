"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

interface ScrollAreaProps extends React.ComponentProps<typeof ScrollAreaPrimitive.Root> {
  orientation?: "vertical" | "horizontal" | "both"
}

function ScrollArea({
  className,
  children,
  orientation = "vertical",
  ...props
}: ScrollAreaProps) {
  // When scrolling horizontally, do NOT force flex-col on the inner div — that collapses horizontal overflow.
  const viewportInnerClass =
    orientation === "vertical"
      ? "[&>div]:!min-h-full [&>div]:!flex [&>div]:!flex-col"
      : orientation === "both"
        ? "[&>div]:!min-h-full"
        : ""

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative h-full", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn("size-full rounded-[inherit]", viewportInnerClass)}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {(orientation === "vertical" || orientation === "both") && <ScrollBar orientation="vertical" />}
      {(orientation === "horizontal" || orientation === "both") && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
