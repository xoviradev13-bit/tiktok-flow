"use client";
import React from "react";

export function CardSkeleton() {
    return (
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="p-4 space-y-3">
                <div className="h-5 w-2/3 animate-pulse rounded bg-muted/60" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted/50" />
                <div className="space-y-2 pt-1">
                    <div className="h-3 w-full animate-pulse rounded bg-muted/40" />
                    <div className="h-3 w-[90%] animate-pulse rounded bg-muted/40" />
                    <div className="h-3 w-4/5 animate-pulse rounded bg-muted/40" />
                </div>
            </div>
            <div className="border-t p-4 flex items-center justify-between">
                <div className="h-8 w-24 animate-pulse rounded bg-muted/50" />
                <div className="h-8 w-16 animate-pulse rounded bg-muted/50" />
            </div>
        </div>
    );
}

export default CardSkeleton;
