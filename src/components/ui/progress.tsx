import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
	value?: number;
	indicatorClassName?: string;
}

export function Progress({ value = 0, className, indicatorClassName, ...props }: ProgressProps) {
	return (
		<div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)} {...props}>
			<div
				className={cn("h-full w-full flex-1 bg-primary transition-all", indicatorClassName)}
				style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value || 0))}%)` }}
			/>
		</div>
	);
}


