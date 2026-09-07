import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: "default" | "ghost";
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          variant === "ghost" && "border-0 shadow-none ring-0 px-0 bg-transparent",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export function AutoSizeInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const spanRef = React.useRef<HTMLSpanElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useLayoutEffect(() => {
    if (!spanRef.current || !inputRef.current) return;
    inputRef.current.style.width = `${spanRef.current.offsetWidth + 2}px`;
  }, [props.value]);

  return (
    <>
      <input
        ref={inputRef}
        {...props}
        style={{ width: "auto" }}
      />
      <span
        ref={spanRef}
        className="absolute invisible whitespace-pre text-sm font-medium px-1"
      >
        {props.value || " "}
      </span>
    </>
  );
}
