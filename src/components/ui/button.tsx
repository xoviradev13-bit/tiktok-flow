import * as React from "react";
import { LucideIcon } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "google" | "destructive" | "ghost" | "secondary";
  icon?: LucideIcon;
  children?: React.ReactNode;
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
};

export function buttonVariants({
  variant = "primary",
  size = "default",
  className,
}: {
  variant?: "primary" | "outline" | "google" | "destructive" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
} = {}) {
  const baseStyle =
    "inline-flex items-center justify-center font-semibold rounded-xl leading-none transition duration-200 transform active:scale-98 focus:outline-none cursor-pointer disabled:opacity-50 disabled:pointer-events-none";

  let variantClass = "";
  if (variant === "primary") {
    variantClass =
      "bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 focus-visible:ring-2 focus-visible:ring-pink-500";
  } else if (variant === "google") {
    variantClass =
      "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-400";
  } else if (variant === "outline") {
    variantClass =
      "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-400";
  } else if (variant === "destructive") {
    variantClass =
      "bg-rose-600 hover:bg-rose-700 text-white focus-visible:ring-2 focus-visible:ring-rose-400";
  } else if (variant === "ghost") {
    variantClass =
      "bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 shadow-none focus:ring-0";
  } else if (variant === "secondary") {
    variantClass =
      "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-500";
  }

  let sizeClass = "";
  if (size === "sm") {
    sizeClass = "h-8 w-fit px-3 text-xs";
  } else if (size === "lg") {
    sizeClass = "h-12 w-fit px-6 text-base";
  } else if (size === "icon") {
    sizeClass = "h-10 w-10 p-0";
  } else {
    sizeClass = "h-10 w-fit px-4 py-2 text-sm";
  }

  return cn(baseStyle, variantClass, sizeClass, className);
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "default",
      icon: Icon,
      asChild = false,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {Icon && <Icon className="w-4 h-4 mr-2 shrink-0" />}
            {children}
          </>
        )}
      </Comp>
    );
  }
);

Button.displayName = "Button";

export default Button;
