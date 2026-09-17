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
    | "brand";
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
      sm: "h-7.5 px-2.5 text-xs rounded-md",
      lg: "h-9.5 px-5 text-sm rounded-md font-medium",
      icon: "h-8 w-8 rounded-md",
    }[size];

    const variantClasses = {
      default:
        "bg-primary text-primary-foreground hover:opacity-90 shadow-sm transition-opacity active:scale-[0.99]",
      brand:
        "bg-primary text-primary-foreground hover:opacity-90 shadow-sm transition-opacity active:scale-[0.99]",
      destructive:
        "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm active:scale-[0.99]",
      outline:
        "border border-border bg-background text-foreground hover:bg-secondary hover:text-foreground shadow-xs active:scale-[0.99]",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 active:scale-[0.99]",
      ghost:
        "hover:bg-secondary text-muted-foreground hover:text-foreground active:scale-[0.99]",
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
