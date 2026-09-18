"use client";

import React, { createContext, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  title: string;
  description?: string;
  type?: "success" | "error" | "info";
}

interface ToastContextType {
  toast: (options: { title: string; description?: string; type?: "success" | "error" | "info" }) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = ({ title, description, type = "success" }: { title: string; description?: string; type?: "success" | "error" | "info" }) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, title, description, type };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-md border p-3.5 shadow-md bg-sand-10 dark:bg-sand-900 text-sand-900 dark:text-sand-100 transition-all duration-300 animate-in slide-in-from-bottom-5",
              t.type === "success" && "border-sage-400/60 dark:border-sage-700/60",
              t.type === "error" && "border-terra-400/60 dark:border-terra-700/60",
              t.type === "info" && "border-slate-400/60 dark:border-slate-700/60"
            )}
          >
            {t.type === "success" && <CheckCircle2 className="h-4 w-4 text-sage-600 dark:text-sage-400 shrink-0 mt-0.5" />}
            {t.type === "error" && <AlertCircle className="h-4 w-4 text-terra-600 dark:text-terra-400 shrink-0 mt-0.5" />}
            {t.type === "info" && <Info className="h-4 w-4 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />}
            <div className="flex-1 text-left">
              <h4 className="text-sm font-semibold">{t.title}</h4>
              {t.description && <p className="text-xs opacity-90 mt-0.5">{t.description}</p>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback if not inside provider
    return {
      toast: (opt: { title: string; description?: string; type?: "success" | "error" | "info" }) => console.log("Toast:", opt),
    };
  }
  return context;
}
