"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { type VariantProps, cva } from "class-variance-authority";

// ============================================================================
// Loading Spinner Variants
// ============================================================================

const spinnerVariants = cva(
    "animate-spin",
    {
        variants: {
            size: {
                xs: "h-3 w-3",
                sm: "h-4 w-4",
                md: "h-5 w-5",
                lg: "h-6 w-6",
                xl: "h-8 w-8",
                "2xl": "h-12 w-12",
            },
            variant: {
                default: "text-primary",
                muted: "text-muted-foreground",
                white: "text-white",
                current: "text-current",
            },
        },
        defaultVariants: {
            size: "md",
            variant: "default",
        },
    }
);

export interface LoadingSpinnerProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
    label?: string;
    showLabel?: boolean;
}

/**
 * LoadingSpinner - A simple animated spinner
 * Use this for inline loading states or when you need a minimal loading indicator
 */
export function LoadingSpinner({
    size,
    variant,
    label = "Loading...",
    showLabel = false,
    className,
    ...props
}: LoadingSpinnerProps) {
    return (
        <div
            className={cn("inline-flex items-center gap-2", className)}
            role="status"
            aria-live="polite"
            aria-label={label}
            {...props}
        >
            <Loader2 className={cn(spinnerVariants({ size, variant }))} />
            {showLabel && (
                <span className="text-sm text-muted-foreground">{label}</span>
            )}
        </div>
    );
}

// ============================================================================
// Loading Container Variants
// ============================================================================

const loadingContainerVariants = cva(
    "flex items-center justify-center",
    {
        variants: {
            variant: {
                default: "",
                card: "rounded-lg border border-slate-200 bg-white",
                overlay: "absolute inset-0 bg-white/80 backdrop-blur-sm z-50",
                fullscreen: "fixed inset-0 bg-white z-50",
            },
            padding: {
                none: "",
                sm: "p-4",
                md: "p-8",
                lg: "p-12",
            },
        },
        defaultVariants: {
            variant: "default",
            padding: "md",
        },
    }
);

export interface LoadingContainerProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof loadingContainerVariants> {
    label?: string;
    description?: string;
    spinnerSize?: VariantProps<typeof spinnerVariants>["size"];
    showLabel?: boolean;
}

/**
 * LoadingContainer - A centered loading state with optional label and description
 * Use this for page sections, cards, or full-page loading states
 */
export function LoadingContainer({
    variant,
    padding,
    label = "Loading...",
    description,
    spinnerSize = "lg",
    showLabel = true,
    className,
    children,
    ...props
}: LoadingContainerProps) {
    return (
        <div
            className={cn(loadingContainerVariants({ variant, padding }), className)}
            role="status"
            aria-live="polite"
            aria-label={label}
            {...props}
        >
            <div className="flex flex-col items-center gap-4 text-center">
                <LoadingSpinner size={spinnerSize} />
                {showLabel && (
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        {description && (
                            <p className="text-xs text-muted-foreground max-w-sm">
                                {description}
                            </p>
                        )}
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}

// ============================================================================
// Loading Skeleton Variants
// ============================================================================

export interface LoadingSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    lines?: number;
    showAvatar?: boolean;
}

/**
 * LoadingSkeleton - A skeleton loading state with animated shimmer
 * Use this for list items or content that has a predictable structure
 */
export function LoadingSkeleton({
    lines = 3,
    showAvatar = false,
    className,
    ...props
}: LoadingSkeletonProps) {
    return (
        <div className={cn("space-y-3", className)} {...props}>
            {Array.from({ length: lines }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                    {showAvatar && i === 0 && (
                        <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse" />
                    )}
                    <div className="flex-1 space-y-2">
                        <div
                            className="h-4 bg-slate-200 rounded animate-pulse"
                            style={{ width: `${Math.random() * 40 + 60}%` }}
                        />
                        {i === 0 && (
                            <div
                                className="h-3 bg-slate-100 rounded animate-pulse"
                                style={{ width: `${Math.random() * 30 + 40}%` }}
                            />
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// Loading Dots Variants
// ============================================================================

export interface LoadingDotsProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: "sm" | "md" | "lg";
    variant?: "default" | "muted";
}

/**
 * LoadingDots - Three animated dots
 * Use this for a subtle, modern loading indicator
 */
export function LoadingDots({
    size = "md",
    variant = "default",
    className,
    ...props
}: LoadingDotsProps) {
    const dotSizes = {
        sm: "h-1.5 w-1.5",
        md: "h-2 w-2",
        lg: "h-2.5 w-2.5",
    };

    const dotColors = {
        default: "bg-primary",
        muted: "bg-muted-foreground",
    };

    return (
        <div
            className={cn("flex items-center gap-1.5", className)}
            role="status"
            aria-label="Loading"
            {...props}
        >
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className={cn(
                        "rounded-full animate-bounce",
                        dotSizes[size],
                        dotColors[variant]
                    )}
                    style={{
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: "0.6s",
                    }}
                />
            ))}
        </div>
    );
}

// ============================================================================
// Loading Progress Bar
// ============================================================================

export interface LoadingProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    progress?: number; // 0-100
    indeterminate?: boolean;
    label?: string;
    showPercentage?: boolean;
}

/**
 * LoadingProgress - A progress bar for determinate or indeterminate loading
 * Use this when you can show progress or for long-running operations
 */
export function LoadingProgress({
    progress = 0,
    indeterminate = false,
    label,
    showPercentage = false,
    className,
    ...props
}: LoadingProgressProps) {
    return (
        <div className={cn("w-full space-y-2", className)} {...props}>
            {(label || showPercentage) && (
                <div className="flex items-center justify-between text-sm">
                    {label && <span className="text-muted-foreground">{label}</span>}
                    {showPercentage && !indeterminate && (
                        <span className="font-medium text-foreground">{progress}%</span>
                    )}
                </div>
            )}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                {indeterminate ? (
                    <div className="h-full w-1/3 animate-[loading-progress_1.5s_ease-in-out_infinite] bg-primary" />
                ) : (
                    <div
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Specialized Loading States
// ============================================================================

/**
 * LoadingPage - Full page loading state
 * Use this for initial page loads or route transitions
 */
export function LoadingPage({
    label = "Loading page...",
    description,
}: {
    label?: string;
    description?: string;
}) {
    return (
        <LoadingContainer
            variant="fullscreen"
            label={label}
            description={description}
            spinnerSize="2xl"
        />
    );
}

/**
 * LoadingCard - Card-style loading state
 * Use this for loading states within card components
 */
export function LoadingCard({
    label = "Loading...",
    description,
    className,
}: {
    label?: string;
    description?: string;
    className?: string;
}) {
    return (
        <LoadingContainer
            variant="card"
            label={label}
            description={description}
            className={className}
        />
    );
}

/**
 * LoadingOverlay - Overlay loading state
 * Use this to show loading over existing content
 */
export function LoadingOverlay({
    label = "Loading...",
    description,
}: {
    label?: string;
    description?: string;
}) {
    return (
        <LoadingContainer
            variant="overlay"
            label={label}
            description={description}
            spinnerSize="xl"
        />
    );
}

/**
 * LoadingInline - Inline loading state with spinner and text
 * Use this for inline loading states like buttons or form fields
 */
export function LoadingInline({
    label = "Loading...",
    size = "sm",
    className,
}: {
    label?: string;
    size?: VariantProps<typeof spinnerVariants>["size"];
    className?: string;
}) {
    return (
        <LoadingSpinner
            size={size}
            label={label}
            showLabel={true}
            className={className}
        />
    );
}
