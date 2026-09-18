import type React from "react";

export function MeetingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-full overflow-hidden bg-background text-foreground antialiased">
      {children}
    </div>
  );
}
