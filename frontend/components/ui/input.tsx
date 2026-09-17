import * as React from "react";
import { cn } from "@/lib/utils";

import { AlertCircle } from "lucide-react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  errorMessage?: string;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, errorMessage, label, readOnly, ...props }, ref) => {
    return (
      <div className="w-full space-y-1">
        {label && (
          <label className="block text-xs font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            type={type}
            readOnly={readOnly}
            className={cn(
              "flex h-8 w-full rounded-md border border-input bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              readOnly &&
                "bg-sand-100 dark:bg-sand-900 border-border text-foreground font-mono select-all cursor-default focus-visible:ring-0",
              error &&
                "border-terra-500 focus-visible:border-terra-500 focus-visible:ring-terra-500 pr-8",
              className
            )}
            ref={ref}
            {...props}
          />
          {error && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-terra-500">
              <AlertCircle className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
        {errorMessage && error && (
          <p className="text-[11px] text-terra-600 dark:text-terra-400">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
