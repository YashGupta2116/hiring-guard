import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "brand"
    | "action"
    | "terra";
  size?: "default" | "sm" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      default: "h-8.5 px-3.5 py-1.5 text-xs font-medium rounded-md",
      sm: "h-7 px-2.5 text-xs rounded-md",
      lg: "h-9.5 px-5 text-sm rounded-md font-medium",
      icon: "h-8 w-8 rounded-md",
    }[size];

    const variantClasses = {
      default:
        "bg-primary text-primary-foreground hover:opacity-90 shadow-xs transition-opacity active:scale-[0.99] border border-transparent",
      brand:
        "bg-clay-600 text-sand-50 hover:bg-clay-700 shadow-xs active:scale-[0.99] border border-clay-700/50",
      action:
        "bg-sand-900 dark:bg-sand-100 text-sand-100 dark:text-sand-950 hover:bg-sand-800 dark:hover:bg-sand-200 shadow-xs active:scale-[0.99]",
      destructive:
        "bg-terra-600 text-white hover:bg-terra-700 shadow-xs active:scale-[0.99] border border-terra-700/50",
      terra:
        "bg-terra-600 text-white hover:bg-terra-700 shadow-xs active:scale-[0.99] border border-terra-700/50",
      outline:
        "border border-border bg-card text-foreground hover:bg-secondary hover:text-foreground shadow-xs active:scale-[0.99]",
      secondary:
        "bg-secondary text-foreground hover:bg-secondary/80 border border-border/80 active:scale-[0.99]",
      ghost:
        "hover:bg-secondary/70 text-muted-foreground hover:text-foreground active:scale-[0.99]",
      link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
    }[variant];

    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 select-none",
          variantClasses,
          sizeClasses,
          className
        )}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
