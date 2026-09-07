"use client";

import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ResizablePanelContainerProps {
    children: React.ReactNode;
    /** true = flush sidebar, false = floating modal card */
    isSidebar?: boolean;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    /** optional explicit max-height for the modal variant */
    maxHeight?: string;
    className?: string;
}

export function ResizablePanelContainer({
    children,
    isSidebar = false,
    defaultWidth = 360,
    minWidth = 280,
    maxWidth = 800,
    maxHeight,
    className,
}: ResizablePanelContainerProps) {
    const [width, setWidth] = useState(defaultWidth);
    const isDragging = useRef(false);
    const [isHandleHovered, setIsHandleHovered] = useState(false);
    const [isHandleDragging, setIsHandleDragging] = useState(false);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            isDragging.current = true;
            setIsHandleDragging(true);
            e.preventDefault();

            const startX = e.clientX;
            const startWidth = width;

            const handleMouseMove = (e: MouseEvent) => {
                if (!isDragging.current) return;
                // Dragging left (negative delta from startX) makes right-side panel WIDER
                const deltaX = startX - e.clientX;
                const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
                setWidth(newWidth);
            };

            const handleMouseUp = () => {
                isDragging.current = false;
                setIsHandleDragging(false);
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        },
        [width, minWidth, maxWidth]
    );

    return (
        <div
            className={cn(
                "relative flex flex-col shrink-0 overflow-hidden",
                isSidebar
                    ? "h-full border-l border-zinc-200 bg-white"
                    : "rounded-xl shadow-xl border border-zinc-200/80 bg-white",
                className
            )}
            style={{
                width: `${width}px`,
                // Set BOTH height and maxHeight so h-full / flex-1 in child components resolves.
                // Without explicit height, maxHeight alone breaks the flex chain.
                height: !isSidebar ? (maxHeight ?? '82vh') : undefined,
                maxHeight: !isSidebar ? (maxHeight ?? '82vh') : undefined,
            }}
        >
            {/* Left-edge drag handle */}
            <div
                className={cn(
                    "absolute top-0 bottom-0 left-0 w-[5px] z-50 cursor-col-resize group/handle transition-colors",
                    isHandleDragging
                        ? "bg-blue-500/40"
                        : isHandleHovered
                        ? "bg-blue-400/25"
                        : "bg-transparent hover:bg-blue-400/20"
                )}
                onMouseDown={handleMouseDown}
                onMouseEnter={() => setIsHandleHovered(true)}
                onMouseLeave={() => setIsHandleHovered(false)}
            >
                {/* Visual grip dots */}
                <div
                    className={cn(
                        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[3px] transition-opacity",
                        isHandleHovered || isHandleDragging ? "opacity-100" : "opacity-0"
                    )}
                >
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className={cn(
                                "w-[3px] h-[3px] rounded-full transition-colors",
                                isHandleDragging ? "bg-blue-500" : "bg-zinc-400"
                            )}
                        />
                    ))}
                </div>
            </div>

            {/* Panel content */}
            <div className="flex flex-col w-full h-full overflow-hidden pl-[5px]">
                {children}
            </div>
        </div>
    );
}
